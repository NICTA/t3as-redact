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

import org.slf4j.LoggerFactory
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.scala.DefaultScalaModule
import com.fasterxml.jackson.module.scala.experimental.ScalaObjectMapper
import javax.ws.rs.{Consumes, Produces}
import javax.ws.rs.ext.{ContextResolver, Provider}
import javax.ws.rs.core.MediaType


/** Provide a JSON mapper for use by JAX-WS
 *  
 *  package configured in web.xml
 */
@Provider
@Consumes(Array(MediaType.APPLICATION_JSON))
@Produces(Array(MediaType.APPLICATION_JSON))
class JSONContextResolver extends ContextResolver[ObjectMapper] {

  val log = LoggerFactory.getLogger(getClass)

  log.debug("ctor")
  
  val mapper = {
    val m = new ObjectMapper() with ScalaObjectMapper
    m.registerModule(DefaultScalaModule)
    m
  }

  def getContext(clazz: Class[_]) = {
    log.debug(s"getContext: clazz = $clazz")
    mapper
  }
}


// Provide an XML mapper for use by JAX-WS
// TODO: So far this just outputs "<item />" for each case class object, no fields.
//@Provider
//@Produces(Array(MediaType.APPLICATION_XML))
//class XMLContextResolver extends ContextResolver[ObjectMapper] {
//
//  val log = LoggerFactory.getLogger(getClass)
//
//  val mapper = {
//    val m = new XmlMapper() with ScalaObjectMapper
//
//    m.registerModule(DefaultScalaModule)
//    m
//  }
//
//  def getContext(clazz: Class[_]) = {
//    log.debug("getting Jackson XmlMapper")
//    mapper
//  }
//}
