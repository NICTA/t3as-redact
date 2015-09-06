import ReleaseTransformations._
import com.typesafe.sbt.license.{DepModuleInfo, LicenseInfo}

organization := "org.t3as"

name := "t3as-redact"

// version := "0.2" // see version.sbt maintained bt sbt-release plugin

licenses := Seq("GNU Affero General Public License v3" -> url("http://www.gnu.org/licenses/agpl-3.0.en.html"))

homepage := Some(url("https://github.com/NICTA/t3as-redact"))

scalaVersion := "2.11.7"

scalacOptions ++= Seq("-unchecked", "-deprecation", "-feature")

libraryDependencies ++= Seq(
  "org.t3as" %% "t3as-pdf" % "0.3",
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
  ) map (_ % "2.21")
  
libraryDependencies ++= Seq(  
  "com.fasterxml.jackson.module" %% "jackson-module-scala",
  "com.fasterxml.jackson.core" % "jackson-annotations",
  "com.fasterxml.jackson.jaxrs" % "jackson-jaxrs-base",
  "com.fasterxml.jackson.jaxrs" % "jackson-jaxrs-json-provider"
  ) map (_ % "2.6.1")

// transitive dependencies for which the specified version has no *-sources.jar in maven central
// so here we specify the next higher version with sources
// libraryDependencies ++= Seq(
//    "xml-apis" % "xml-apis" % "1.4.01",
//    "com.google.code.findbugs" % "jsr305" % "2.0.3"
//   )

// webapp container used by `container:start`
// libraryDependencies ++= Seq(
//  "jetty-webapp",
//  "jetty-plus"
// ) map ("org.eclipse.jetty" % _ % "9.1.0.v20131115" % "container")

// fork all test and run tasks: http://www.scala-sbt.org/0.13/docs/Forking.html
fork := true

// forked JVM settings (tests run out of memory with sbt default -Xmx1024m)
javaOptions := Seq("-Xmx2500M")

EclipseKeys.withSource := true

// If Eclipse and sbt are both building to same dirs at same time it takes forever and produces corrupted builds.
// So here we tell Eclipse to build somewhere else (bin is it's default build output folder)
EclipseKeys.eclipseOutput in Compile := Some("bin")   // default is sbt's target/scala-2.11/classes

EclipseKeys.eclipseOutput in Test := Some("test-bin") // default is sbt's target/scala-2.11/test-classes

EclipseKeys.createSrc := EclipseCreateSrc.Default + EclipseCreateSrc.Resource

net.virtualvoid.sbt.graph.Plugin.graphSettings

enablePlugins(JettyPlugin)

containerMain in Jetty := "org.eclipse.jetty.runner.Runner"

// publishLocal will publish the jar as well as the war
publishArtifact in (Compile, packageBin) := true

// for forked JVM running the container
containerForkOptions := new ForkOptions(runJVMOptions = Seq("-Xmx3g"))

// default release process, but without publishArtifacts
releaseProcess := Seq[ReleaseStep](
  checkSnapshotDependencies,
  inquireVersions,
  runTest,
  setReleaseVersion,
  commitReleaseVersion,
  tagRelease,
  // publishArtifacts,
  setNextVersion,
  commitNextVersion,
  pushChanges
)

def hasPrefix(org: String, prefixes: Seq[String]) = prefixes.exists(x => org.startsWith(x))

licenseOverrides := {
    case DepModuleInfo(org, _, _) if hasPrefix(org, Seq("org.apache", "com.fasterxml", "com.google.guava", "org.javassist")) => LicenseInfo(LicenseCategory.Apache, "The Apache Software License, Version 2.0", "http://www.apache.org/licenses/LICENSE-2.0.txt")
    case DepModuleInfo(org, _, _) if hasPrefix(org, Seq("com.thoughtworks.paranamer")) => LicenseInfo(LicenseCategory.BSD, "BSD-Style", "http://www.opensource.org/licenses/bsd-license.php")
    case DepModuleInfo(org, _, _) if hasPrefix(org, Seq("javax.", "org.jvnet.mimepull", "org.glassfish")) => LicenseInfo(LicenseCategory.GPLClasspath, "CDDL + GPLv2 with classpath exception", "https://glassfish.dev.java.net/nonav/public/CDDL+GPL.html")
    case DepModuleInfo(org, _, _) if hasPrefix(org, Seq("ch.qos.logback")) => LicenseInfo(LicenseCategory.LGPL, "EPL + GNU Lesser General Public License", "http://logback.qos.ch/license.html")
    case DepModuleInfo(org, _, _) if hasPrefix(org, Seq("org.slf4j")) => LicenseInfo(LicenseCategory.MIT, "MIT License", "http://www.slf4j.org/license.html")
  }
