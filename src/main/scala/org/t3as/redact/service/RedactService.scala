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
import org.t3as.redact.nlp.Param.{Extract, Input, Redact}
import org.t3as.redact.util.CopyUtil.copy

import com.fasterxml.jackson.databind.ObjectMapper

import javax.servlet.{ServletContextEvent, ServletContextListener}
import javax.ws.rs.{ApplicationPath, Consumes, GET, POST, Path, Produces, QueryParam}
import javax.ws.rs.core.{Context, MediaType, Response, StreamingOutput}
import javax.ws.rs.ext.Providers

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
    override def contextInitialized(event: ServletContextEvent) = NLPModelsSingleton.init(new NLPModels) // test code could init with subclass NLPModels
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

  @Path("redact")
  @POST
  @Consumes(Array(MediaType.MULTIPART_FORM_DATA))
  @Produces(Array("application/pdf"))
  def redact(@FormDataParam("pdfFile") in: InputStream, @FormDataParam("redact") redact: String): Response = {
    val r = mapper.readValue(redact, classOf[Redact]) // deserialize JSON
    log.debug(s"redact: r = $r")

    // TODO: can we use memory rather than tmp files?
    val tmpIn = createTempFile("redactService", "redactIn")
    val tmpOut = createTempFile("redactService", "redactOut")
    try {
      copy(in, tmpIn)
      Pdf.redact(tmpIn, tmpOut, r.redact)
      val stream = new StreamingOutput {
        // invoked after redact has returned
        override def write(os: OutputStream) = {
          copy(tmpOut, os)
          os.close
          tmpOut.delete
        }
      }
      Response.ok(stream).build
    } finally tmpIn.delete
  }

  // URL: http://localhost:8080/redact/rest/v1.0/corenlp/json?in=Bill%20hit%20Joe
  @Path("corenlp/json")
  @GET
  @Produces(Array(MediaType.APPLICATION_JSON))
  def corenlpGetJson(@QueryParam("in") in: String, @QueryParam("withCoref") withCoref: Boolean = false) =
    NLPModelsSingleton.get.coreNlp.processResult(in, withCoref)

  @Path("corenlp/json")
  @POST
  @Consumes(Array(MediaType.APPLICATION_JSON))
  @Produces(Array(MediaType.APPLICATION_JSON))
  def corenlpPostJson(in: Input) =
    NLPModelsSingleton.get.coreNlp.processResult(in.text, in.withCoref)

  @Path("corenlp/xml")
  @GET
  @Produces(Array(MediaType.TEXT_XML))
  def corenlpGetXml(@QueryParam("in") in: String, @QueryParam("withCoref") withCoref: Boolean = false) =
    NLPModelsSingleton.get.coreNlp.processXml(in, withCoref)

  @Path("opennlp/json")
  @GET
  @Produces(Array(MediaType.APPLICATION_JSON))
  def opennlpGetJson(@QueryParam("in") in: String, @QueryParam("withCoref") withCoref: Boolean = false) =
    NLPModelsSingleton.get.openNlp.processResult(in)

  @Path("opennlp/json")
  @POST
  @Consumes(Array(MediaType.APPLICATION_JSON))
  @Produces(Array(MediaType.APPLICATION_JSON))
  def opennlpPostJson(in: Input) =
    NLPModelsSingleton.get.openNlp.processResult(in.text)
}
