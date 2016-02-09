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
package org.t3as.redact.service

import java.io.{InputStream, OutputStream, Closeable}
import java.io.File.createTempFile
import org.glassfish.jersey.filter.LoggingFilter
import org.glassfish.jersey.media.multipart.{FormDataParam, MultiPartFeature}
import org.glassfish.jersey.server.ResourceConfig
import org.slf4j.LoggerFactory
import org.t3as.pdf.Pdf
import org.t3as.redact.nlp.{CoreNlpModels, OpenNlpModels}
import org.t3as.redact.nlp.Param.{Extract, Input, Redact, Result}
import org.t3as.redact.util.CopyUtil.copy
import com.fasterxml.jackson.databind.ObjectMapper
import javax.servlet.{ServletContextEvent, ServletContextListener}
import javax.ws.rs.{ApplicationPath, Consumes, GET, POST, Path, Produces, QueryParam}
import javax.ws.rs.core.{Context, MediaType, Response, StreamingOutput}
import javax.ws.rs.ext.Providers
import org.t3as.redact.nlp.EmailNER.appendEmailAddresses
import io.swagger.annotations.{ Api, ApiOperation, ApiParam }

object RedactService {
  
  /** The NLP models contained here are very expensive to initialize, so we do it once on servelet startup.
   *  Jersey instantiates multiple instances of class RedactService on-demand, but these share one instance of
   *  this class, accessed via NLPModelsSingleton.
   */
  class NLPModels extends Closeable {
    val coreNlp = new CoreNlpModels
    val openNlp = new OpenNlpModels

    override def close = {}
  }

  class CloseableSingleton[T <: Closeable] extends Closeable {
    var t: Option[T] = None
    def init(s: T) = t = Some(s)
    override def close = t.map(_.close)
    def get = t.getOrElse(throw new Exception("not initialised"))
  }

  object NLPModelsSingleton extends CloseableSingleton[NLPModels] // someone has to call init()

  /** class configured in web.xml */
  class MyContextListener extends ServletContextListener {
    override def contextInitialized(event: ServletContextEvent) = NLPModelsSingleton.init(new NLPModels) // test code could init with subclass of NLPModels
    override def contextDestroyed(event: ServletContextEvent) = NLPModelsSingleton.close
  }

  /** class configured in web.xml */
  @ApplicationPath("/")
  class MyApplication extends ResourceConfig(
    classOf[MultiPartFeature], // required by MediaType.MULTIPART_FORM_DATA
    classOf[LoggingFilter])  
}

/** Jersey instantiates multiple instances
 *  package configured in web.xml
 */
@Api("redaction")
@Path("/v1.0")
class RedactService {
  import RedactService._
  
  val log = LoggerFactory.getLogger(getClass)

  log.debug("ctor")

  var mapper: ObjectMapper = null; // get Jersey to give us its Jackson object mapper

  @Context
  def setProviders(p: Providers) = {
    log.debug(s"setProviders: p = $p")
    mapper = p.getContextResolver(classOf[ObjectMapper], MediaType.APPLICATION_JSON_TYPE).getContext(classOf[ObjectMapper])
  }

  @ApiOperation(
    value = "extract text from PDF",
    notes = "returns text from each page")
  @Path("extractText")
  @POST
  @Consumes(Array(MediaType.MULTIPART_FORM_DATA))
  @Produces(Array(MediaType.APPLICATION_JSON))
  def extractText(@FormDataParam("pdfFile") in: InputStream) = {
    val tmp = createTempFile("redactService", "extractText")
    try {
      copy(in, tmp)
      Extract(Pdf.extract(tmp))
    } finally tmp.delete
  }

  @ApiOperation(
    value = "echo PDF",
    notes = "the binary response is a copy of the request data (used by UI to display the PDF)")
  @Path("echo")
  @POST
  @Consumes(Array(MediaType.MULTIPART_FORM_DATA))
  @Produces(Array("application/pdf"))
  def echo(@FormDataParam("pdfFile") in: InputStream): Response = {
    log.debug("echo...")
    val stream = new StreamingOutput {
      override def write(os: OutputStream) = copy(in, os)
    }
    Response.ok(stream).build
  }
  
  @ApiOperation(
    value = "redact PDF",
    notes = "inputs: a PDF file and a JSON string containing redaction instructions; Output: redacted PDF")
  @Path("redact")
  @POST
  @Consumes(Array(MediaType.MULTIPART_FORM_DATA))
  @Produces(Array("application/pdf"))
  def redact(
    @FormDataParam("pdfFile") in: InputStream,
    
    @ApiParam("""{ "redact": [ { "page": 1, "start": 10, "end": 20, "reason": "test" }, ... ] }""")
    @FormDataParam("redact") redact: String
  ): Response = {
    val r = mapper.readValue(redact, classOf[Redact]) // deserialize JSON
    log.debug(s"redact: r = $r")
    val stream = new StreamingOutput {
      override def write(os: OutputStream) = Pdf.redact(in, os, r.redact)
    }
    Response.ok(stream).build
  }

  @ApiOperation(
    value = "identify named entities in the input text",
    notes = "uses Stanford CoreNLP")
  @Path("corenlp/json")
  @GET
  @Produces(Array(MediaType.APPLICATION_JSON))
  def corenlpGetJson(
    @ApiParam("input text") @QueryParam("in") in: String,
    @ApiParam("whether to apply co-reference identification - if false coRefs arrays in the result will be empty") @QueryParam("withCoref") withCoref: Boolean = false
  ) = appendEmailAddresses(NLPModelsSingleton.get.coreNlp.processResult(in, withCoref), in)

  @ApiOperation(
    value = "identify named entities in the input text",
    notes = "uses Stanford CoreNLP. withCoref = true applies CoreNLP's co-reference identification - if false coRefs arrays in the result will be empty")
  @Path("corenlp/json")
  @POST
  @Consumes(Array(MediaType.APPLICATION_JSON))
  @Produces(Array(MediaType.APPLICATION_JSON))
  def corenlpPostJson(in: Input) =
    appendEmailAddresses(NLPModelsSingleton.get.coreNlp.processResult(in.text, in.withCoref), in.text)

  @ApiOperation(
    value = "identify named entities in the input text",
    notes = "uses Stanford CoreNLP")
  @Path("corenlp/xml")
  @GET
  @Produces(Array(MediaType.TEXT_XML))
  def corenlpGetXml(
    @ApiParam("input text") @QueryParam("in") in: String,
    @ApiParam("whether to apply co-reference identification - if false coRefs arrays in the result will be empty") @QueryParam("withCoref") withCoref: Boolean = false
  ) = NLPModelsSingleton.get.coreNlp.processXml(in, withCoref)

  @ApiOperation(
    value = "identify named entities in the input text",
    notes = "uses OpenNLP")
  @Path("opennlp/json")
  @GET
  @Produces(Array(MediaType.APPLICATION_JSON))
  def opennlpGetJson(
    @ApiParam("input text") @QueryParam("in") in: String, 
    @ApiParam("not used - no co-reference identification, coRefs arrays in the result always empty") @QueryParam("withCoref") withCoref: Boolean = false
  ) = appendEmailAddresses(NLPModelsSingleton.get.openNlp.processResult(in), in)

  @ApiOperation(
    value = "identify named entities in the input text",
    notes = "uses OpenNLP, withCoref is not used, coRefs arrays in the result always empty")
  @Path("opennlp/json")
  @POST
  @Consumes(Array(MediaType.APPLICATION_JSON))
  @Produces(Array(MediaType.APPLICATION_JSON))
  def opennlpPostJson(in: Input) =
    appendEmailAddresses(NLPModelsSingleton.get.openNlp.processResult(in.text), in.text)
}
