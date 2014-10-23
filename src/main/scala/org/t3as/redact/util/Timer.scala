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

import org.slf4j.LoggerFactory

class Timer {
  private var t0 = 0L
  private var elapsed = 0L

  reset

  def reset = {
    elapsed = 0L
    start
  }

  def start = t0 = System.currentTimeMillis

  def stop = {
    val t = System.currentTimeMillis
    elapsed += (t - t0)
    t0 = t // assume start immediately after stop
  }

  def elapsedSecs = {
    stop
    elapsed * 1e-3d
  }

}

object Timer {
  val log = LoggerFactory.getLogger(getClass)
  
  def apply() = new Timer()
  
  // msg contains "{}" which is replaced by the elapsed time in secs
  def timed(msg: String)(action: => Unit) = {
    val t = Timer()
    action
    log.info(msg, t.elapsedSecs)
  }
}