/*
 * Copyright (c) 2014 NICTA
 * 
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License version 3
 * as published by the Free Software Foundation.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty
 * of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details. You should have
 * received a copy of the GNU Affero General Public License along with this
 * program; if not, see http://www.gnu.org/licenses or write to the Free
 * Software Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston,
 * MA, 02110-1301 USA.
 * 
 * The interactive user interfaces in modified source and object code
 * versions of this program must display Appropriate Legal Notices, as
 * required under Section 5 of the GNU Affero General Public License.
 */
package org.t3as.redact.nlp

import java.io.ByteArrayOutputStream
import java.util.Properties

import scala.collection.JavaConversions.{asScalaBuffer, collectionAsScalaIterable, seqAsJavaList}
import scala.collection.mutable.ListBuffer

import org.slf4j.LoggerFactory
import Param._
import org.t3as.redact.util.Timer

import edu.stanford.nlp.dcoref.CorefChain.CorefMention
import edu.stanford.nlp.dcoref.CorefCoreAnnotations.CorefChainAnnotation
import edu.stanford.nlp.dcoref.Dictionaries.MentionType.NOMINAL
import edu.stanford.nlp.ling.CoreAnnotations.{SentencesAnnotation, TokensAnnotation}
import edu.stanford.nlp.ling.CoreLabel
import edu.stanford.nlp.pipeline.Annotation
import edu.stanford.nlp.pipeline.Annotator.{STANFORD_DETERMINISTIC_COREF, STANFORD_LEMMA, STANFORD_NER, STANFORD_PARSE, STANFORD_POS, STANFORD_SSPLIT, STANFORD_TOKENIZE}
import edu.stanford.nlp.pipeline.StanfordCoreNLP


object CoreNlpModels {
  private val log = LoggerFactory.getLogger(getClass)
  
  def toXmlString(c: StanfordCoreNLP, a: Annotation) = {
    val os = new ByteArrayOutputStream
    c.xmlPrint(a, os); // this builds it as the encoding specified in the properties
    new String(os.toByteArray, c.getEncoding)
  }

  // initial code based on: edu.stanford.nlp.pipeline.XMLOutputter
  def toResult(in: String, a: Annotation) = {
    val namedEntities = new ListBuffer[NamedEntity]
    val sentences = a.get(classOf[SentencesAnnotation]).toIndexedSeq

    def toMention(m: CorefMention) = {
      val tokens = sentences.get(m.sentNum - 1).get(classOf[TokensAnnotation]).toList
      def token(wordIndex: Int) = tokens(wordIndex - 1) // wordIndex is 1 based index into tokens (a sentence)
      val tstr = token(m.startIndex)
      val str = tstr.beginPosition // character offsets are 0 based into the whole input (not sentence based). Extra spaces between tokens are counted.
      val end = token(m.endIndex - 1).endPosition
      log.debug(s"toResult.toMention: ${m.mentionSpan}, type ${m.mentionType}, word indices (${m.startIndex}, ${m.endIndex}) => char offsets ($str, $end), ner = ${tstr.ner}")
      // use substring of orig text rather than mentionSpan, because later can have "-LRB-02-RRB-" instead of "(02)"
      (Mention(str, end, in.substring(str, end)), tstr.ner)
    }

    val NO_NER = "O"

    // add named entities from corefs
    for {
      corefChains <- Option(a.get(classOf[CorefChainAnnotation]))
      chain <- corefChains.values
    } {
      val repMention = chain.getRepresentativeMention
      val (m, ner) = toMention(repMention)
      if (ner != NO_NER) namedEntities += NamedEntity(m, ner, chain.getMentionsInTextualOrder.toList.filter(m => m != repMention && m.mentionType != NOMINAL).map(m => toMention(m)._1))
      // skip NOMINAL mentions in corefs. Examples:
      //   "cookies"
      //   "that being born in the 1920 's , he ..."
      //   "At the AGM of Berkshire Hathaway"
    }
    log.debug(s"toResult: NER count from corefs = ${namedEntities.size}. namedEntities = $namedEntities")


    // The rest of this method is to add named entities not included in corefs.
    // Corefs covers most cases because it includes cases where getMentionsInTextualOrder contains only getRepresentativeMention
    // (i.e. cases with no co-references), including NER types PERSON, LOCATION and DATE.
    // However, with "World Bank" in the input it does not include that. The following code appends this with NER type ORGANIZATION.

    // add a dummy non-ner at start and end to avoid having to handle a ner as the first or last word of a sentence
    def addDummies(i: Iterator[CoreLabel]) = {
      def dummyCoreLabel(pos: Int) = {
        val l = new CoreLabel
        l.setBeginPosition(pos)
        l.setEndPosition(pos)
        l.setNER(NO_NER)
        Iterator.single(l)
      }
      dummyCoreLabel(0) ++ i ++ dummyCoreLabel(Int.MaxValue)
    }

    def hasNER(l: CoreLabel) = l.ner != NO_NER
    
    // merge sequential tokens with same ner
    // find ner boundaries - changes from non-ner to ner, ner to non-ner, ner to different ner.
    // Emit "start", "end" events ("start", "end" strings not needed, but might help with understanding or debugging).
    val boundaries = for {
      s <- sentences.toIterator
      (a :: b :: _) <- addDummies(s.get(classOf[TokensAnnotation]).toIterator).sliding(2) if a.ner != b.ner
      v <- (hasNER(a), hasNER(b)) match {
        case (true, true) => Seq(("end", a.ner, a.endPosition), ("start", b.ner, b.beginPosition))
        case (false, true) => Seq(("start", b.ner, b.beginPosition))
        case (true, false) => Seq(("end", a.ner, a.endPosition))
        case (false, false) => Seq()
      }
    } yield v
    // pair up the "start", "end" events to produce merged ner ranges
    val merged = for {
      (start :: end :: _) <- boundaries.sliding(2, 2)
    } yield (start._2, start._3, end._3) // (ner, beginPosition, endPosition), positions are character offsets

    val corefStartOffsets = namedEntities.map(n => n.representative.start).toSet // skip those we already have (those with corefs)
    for {
      (ner, str, end) <- merged if !corefStartOffsets.contains(str)
    } namedEntities += NamedEntity(Mention(str, end, in.substring(str, end)), ner, List())
    log.debug(s"toResult: total NER count = ${namedEntities.size}")

    val r = Result(namedEntities.toList)
    log.debug(s"toResult: r = $r")
    r
  } 
}

class CoreNlpModels {
  val log = LoggerFactory.getLogger(getClass)
  
  def properties(withCoref: Boolean) = {
    import edu.stanford.nlp.pipeline.Annotator._
    // NER requires the preceding entries, COREF requires PARSE
    val s =  Seq(STANFORD_TOKENIZE, STANFORD_SSPLIT, STANFORD_POS, STANFORD_LEMMA, STANFORD_NER)
    val ano = if (withCoref) s ++ Seq(STANFORD_PARSE, STANFORD_DETERMINISTIC_COREF) else s 
    val p = new Properties
    p.setProperty("annotators", ano.mkString(", ")) // value is [, \t]+ separated String
    p
  }
  
  val t = Timer()
  val stanfordCoreNLP = new StanfordCoreNLP(properties(false), true)
  log.info(s"StanfordCoreNLP pipeline without coref created in ${t.elapsedSecs} secs.")
  
  t.reset
  val stanfordCoreNLPWithCoref = new StanfordCoreNLP(properties(true), true)
  log.info(s"StanfordCoreNLP pipeline with coref created in ${t.elapsedSecs} secs.")
  
  def get(withCoref: Boolean) = if (withCoref) stanfordCoreNLPWithCoref else stanfordCoreNLP
    
  def process(in: String, withCoref: Boolean) = get(withCoref).process(in)
  def processResult(in: String, withCoref: Boolean) = CoreNlpModels.toResult(in, get(withCoref).process(in))
  def processXml(in: String, withCoref: Boolean) = CoreNlpModels.toXmlString(get(withCoref), get(withCoref).process(in))
}

