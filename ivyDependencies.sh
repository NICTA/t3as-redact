#! /bin/bash

deps() {
  awk 'NF == 3 && split($3, a, ":") == 3 {
    sub(/\x1B.*/, "", a[3])
    printf "~/.ivy2/cache/%s/%s/srcs/%s-%s-sources.jar\n", a[1], a[2], a[2], a[3]  
  }' | while read f; do
    eval g=$f
    if [[ -f $g ]]; then
      echo $g
    else
      echo $g >&2
    fi 
  done
}

if true; then
  deps                                # you are doing the 'else' branch manually
else
  # this is executable documentation
  sbt update-classifiers              # download source jars for all dependencies into ~/.ivy2/cache
  sbt dependency-license-info > a0    # list all transitive dependencies
  deps < a0 > a1 2> a2                # convert dependencies to path under ~/.ivy2/cache, those found to a1, not found to a2
  cat a2                              # inspect for missing sources
                                      # tar up those found
  tar -cvf target/dependencySourceJars.tar --transform 's,^.*/\.ivy2/cache/,,' `cat a1`
  rm a0 a1 a2
fi