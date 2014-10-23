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

import java.io.InputStream
import scala.language.postfixOps
import org.slf4j.LoggerFactory
import org.t3as.redact.util.Timer
import opennlp.tools.namefind.{NameFinderME, TokenNameFinderModel}
import opennlp.tools.sentdetect.{SentenceDetectorME, SentenceModel}
import opennlp.tools.tokenize.{TokenizerME, TokenizerModel}
import opennlp.tools.util.Span
import org.t3as.redact.nlp.Param._

class OpenNlpModels {
  val log = LoggerFactory.getLogger(getClass)
  
  val resStream = getClass.getResourceAsStream _
  
  def mkModel[M](path: String, ctor: InputStream => M): M = {
    val in = resStream(path)
    try ctor(in)
    finally in.close
  }
  
  val t = Timer()
  val sentenceModel = mkModel("/openNlpModels/en-sent.bin", s => new SentenceModel(s)) // models are thread-safe
  log.info(s"OpenNlpImpl: loaded SentenceModel in ${t.elapsedSecs} secs.")
  
  t.reset
  val tokenModel = mkModel("/openNlpModels/en-token.bin", s => new TokenizerModel(s))
  log.info(s"OpenNlpImpl: loaded TokenizerModel in ${t.elapsedSecs} secs.")
  
  val nerModels = {
    def nerM(typ: String) = mkModel(s"/openNlpModels/en-ner-${typ.toLowerCase}.bin", s => new TokenNameFinderModel(s))
    Seq("DATE", "TIME", "LOCATION", "MONEY", "ORGANIZATION", "PERCENTAGE", "PERSON").map { typ =>
      t.reset
      val n = nerM(typ)
      log.info(s"OpenNlpImpl: loaded TokenNameFinderModel for $typ in ${t.elapsedSecs} secs.")
      (typ, n)
    }
  }
  log.info(s"OpenNlpImpl: all models loaded.")
  
  def sentenceDetector = new SentenceDetectorME(sentenceModel) // not thread-safe
  def tokenizer = new TokenizerME(tokenModel)
  def nameFinders = nerModels.map { case (typ, m) => (typ, new NameFinderME(m)) }

  def toText(t: String)(s: Span) = t.substring(s.getStart, s.getEnd)
  
  def processResult(text: String) = {
    val sd = sentenceDetector
    val tok = tokenizer
    val nFinders = nameFinders
    val l = for {
      sentSpan <- sd.sentPosDetect(text).toList // span for each sentence
      sentText = toText(text)(sentSpan) // text for each sentence
      tokSpans = tok.tokenizePos(sentText) // array of spans for each token, relative to sentText
      tokText = tokSpans map toText(sentText) // array of text for each token  
      (typ, f) <- nameFinders // each name finder
      s <- f.find(tokText) // perform NER for entities of type typ
      str = sentSpan.getStart + tokSpans(s.getStart).getStart // convert token span to char index into whole text
      end = sentSpan.getStart + tokSpans(s.getEnd - 1).getEnd
    } yield NamedEntity(Mention(str, end, text.substring(str, end)), typ, List())
    Result(l)
  }
}

