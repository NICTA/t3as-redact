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
package org.t3as.redact.util

import java.io.{ File, FileInputStream, FileOutputStream, InputStream, OutputStream }

import org.slf4j.LoggerFactory

import resource.managed

object CopyUtil {
  private val log = LoggerFactory.getLogger(getClass)

  def copy(in: InputStream, out: OutputStream): Unit = {
    val buf = new Array[Byte](8192)
    for (n <- Iterator.continually(in.read(buf)).takeWhile(_ != -1) if n > 0) {
      log.debug(s"copy: n = $n")
      out.write(buf, 0, n)
    }
  }

  def copy(in: InputStream, out: File): Unit = for {
    os <- managed(new FileOutputStream(out))
  } copy(in, os)

  def copy(in: File, out: OutputStream): Unit = for {
    is <- managed(new FileInputStream(in))
  } copy(is, out)

  def copy(in: File, out: File): Unit = for {
    is <- managed(new FileInputStream(in))
    os <- managed(new FileOutputStream(out))
  } copy(is, os)
}
