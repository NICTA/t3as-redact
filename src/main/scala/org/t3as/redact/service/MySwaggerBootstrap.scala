package org.t3as.redact.service

import javax.servlet.ServletConfig
import javax.servlet.http.HttpServlet
import io.swagger.jaxrs.config.BeanConfig

/** Hard-coded config for now.
 *  Could get from a properties file and allow overriding with env vars
 *  (as in https://github.inside.nicta.com.au/nbacon/social-watch/tree/master/analytics).
 */
class MySwaggerBootstrap extends HttpServlet {
    override def init(c: ServletConfig) = {
        super.init(c)
        val b = new BeanConfig
        b.setVersion("1.0")
        b.setContact("neil.bacon@nicta.com.au")
        b.setTitle("PDF Redaction")
        b.setDescription("Web services for named entity recognition and PDF redaction")
        b.setLicense("AGPL")
        b.setLicenseUrl("http://www.gnu.org/licenses/agpl-3.0.en.html")
//        Omit to use current scheme & host
//        b.setSchemes(Array("http"))
//        b.setHost("http://redact.t3as.org/")
        b.setBasePath("/rest");
        b.setResourcePackage("org.t3as.redact.service") // was io.swagger.resources
        b.setScan(true)
        b.setPrettyPrint(true)
    }
}