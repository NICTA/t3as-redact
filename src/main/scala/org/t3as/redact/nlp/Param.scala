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

import org.t3as.pdf.RedactItem

/** Input and output parameter types for service methods */
object Param {
  case class Input(text: String, withCoref: Boolean)
  case class Mention(start: Int, end: Int, text: String)
  case class NamedEntity(representative: Mention, ner: String, coRefs: List[Mention])
  case class Result(namedEntities: List[NamedEntity])
  case class Extract(pages: List[String])
  case class Redact(redact: List[RedactItem])
}