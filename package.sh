#! /bin/bash

# Although this script is not pretty, I consider it less evil than complicating the build for
# our specific production packaging, which is unlikely to be of use to anyone else using the project.

# package dynamic web app as a .tar.gz containing the war file and the static data it depends on (none in this case)
rm -rf tmp
for n in redact
do
    mkdir -p tmp/$n/data
    src=`echo target/$n-*.war`
    echo "Creating $n.tar.gz ..."
    cp $src tmp/$n/$n.war
    tar cfz $n.tar.gz -C tmp $n
done

