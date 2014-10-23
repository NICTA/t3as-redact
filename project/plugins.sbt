resolvers += Resolver.url("eamelinks bintray", url("http://dl.bintray.com/eamelink/sbt-plugins"))(Resolver.ivyStylePatterns)

addSbtPlugin("com.earldouglas" % "xsbt-web-plugin" % "0.9.0")

addSbtPlugin("net.eamelink.sbt" % "sbt-purescript" % "0.4.0")

addSbtPlugin("net.virtual-void" % "sbt-dependency-graph" % "0.7.4")