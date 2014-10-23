organization := "org.t3as"

name := "redact"

version := "0.1"

licenses := Seq("GNU Affero General Public License v3" -> url("http://www.gnu.org/licenses/agpl-3.0.en.html"))

homepage := Some(url("https://github.com/NICTA/t3as-redact"))

net.virtualvoid.sbt.graph.Plugin.graphSettings

scalaVersion := "2.11.2"

scalacOptions ++= Seq("-unchecked", "-deprecation", "-feature")

lazy val root = (project in file(".")).enablePlugins(SbtWeb)

seq(com.earldouglas.xsbtwebplugin.WebPlugin.webSettings :_*)

// publishLocal will publish the jar as well as the war
publishArtifact in (Compile, packageBin) := true

libraryDependencies ++= Seq(
  "org.t3as" %% "pdf" % "0.1",
  "org.apache.opennlp" % "opennlp-tools" % "1.5.3",
  "com.thetransactioncompany" % "cors-filter" % "1.9.2",
  "org.slf4j" % "slf4j-api" % "1.7.6",
  "ch.qos.logback" % "logback-classic" % "1.1.1" % "runtime",
  "org.scalatest" % "scalatest_2.11" % "2.2.1-M1" % "test",
  "javax.servlet" % "javax.servlet-api" % "3.0.1" % "provided" 
  )

libraryDependencies ++= Seq(
   "edu.stanford.nlp" % "stanford-corenlp" % "3.3.1",
   "edu.stanford.nlp" % "stanford-corenlp" % "3.3.1" classifier "models"
  )
  
libraryDependencies ++= Seq(  
  "org.glassfish.jersey.containers" % "jersey-container-servlet",
  "org.glassfish.jersey.media" % "jersey-media-json-jackson",
  "org.glassfish.jersey.media" % "jersey-media-multipart"
  ) map (_ % "2.9")
  
libraryDependencies ++= Seq(  
  "com.fasterxml.jackson.module" %% "jackson-module-scala",
  "com.fasterxml.jackson.core" % "jackson-annotations",
  "com.fasterxml.jackson.jaxrs" % "jackson-jaxrs-base",
  "com.fasterxml.jackson.jaxrs" % "jackson-jaxrs-json-provider"
  ) map (_ % "2.4.1")

// transitive dependencies for which the specified version has no *-sources.jar in maven central
// so here we specify the next higher version with sources
libraryDependencies ++= Seq(
   "xml-apis" % "xml-apis" % "1.4.01",
   "com.google.code.findbugs" % "jsr305" % "2.0.3"
  )

// for forked JVM running the container
javaOptions in com.earldouglas.xsbtwebplugin.WebPlugin.container.Configuration += "-Xmx3g"

// webapp container used by `container:start`
libraryDependencies ++= Seq(
  "jetty-webapp",
  "jetty-plus"
) map ("org.eclipse.jetty" % _ % "9.1.0.v20131115" % "container")
