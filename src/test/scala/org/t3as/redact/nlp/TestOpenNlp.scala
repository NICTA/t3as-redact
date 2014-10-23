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

import org.scalatest.{ Matchers, FlatSpec }
import org.slf4j.LoggerFactory

class TestOpenNlp extends FlatSpec with Matchers {
  val log = LoggerFactory.getLogger(getClass)

  "OpenNLP" should "find named entities" in {
    val x = new OpenNlpModels
    val text = """
Several weeks ago, two of the asylum seekers who were housed in Mike compound had never heard of Chauka. One of them was an eyewitness to the murder of Reza Barati during the night of violence that engulfed the centre in February.
All that changed when they voiced their opposition to changes to the detention centre policy covering phone and internet access, insisting the changes made it almost impossible to talk to family members in the Middle East.
In a graphic account subsequently posted on Facebook, the Iranian who witnessed Barati's murder said he had been taken to Chauka, fed bread and water for three days and made to sleep on the muddy ground.
"""
    val r = x.processResult(text)
    log.debug(s"r = $r")
    r.namedEntities.size > 1 should be(true)
  }
}