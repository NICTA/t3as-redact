# t3as

## Redact

### Introduction

This project provides:
- a RESTful JSON web service for PDF redaction; and
- a prototype HTML/Javascript UI using the service.

The web services are:
- extractText: upload PDF and return text extracted from it;
- redact: upload PDF and redaction specified as character offsets into extracted text and return redacted PDF;
- upload text and return named entities found by one of three NLP packages.

The [prototype UI](http://redaction.research.nicta.com.au:8080/redact/ui.html) supports the workflow:

1. upload PDF, server responds with array of one string per page of text extracted from the PDF;
2. user can edit the extracted text; alternatively the user can skip step 1 and start by pasting in text;
3. perform named entity recognition on the text, optionally with co-references (identifying subsequent references to the same entity);
4. select named entities to redact;
5. perform redaction: the PDF is uploaded again (the server is stateless) and the redacted PDF is downloaded with selected named entities and their co-references and metadata removed.

Required functionality not yet provided:
- allow the user to manipulate the named entity mentions:
  - delete,
  - create,
  - modify type and extent,
  - move representative mention to coRef of some other representative mention (the moved coRefs become coRefs of the destination (which makes undo problematic)),
  - move coRef to new representative mention,
  - move coRef to a different representative mention;
- include redactionReason in redaction request and redacted PDF.

### Implementation

Data structure for the result of named entity recognition:
    
    case class Mention(start: Int, end: Int, text: String)
    case class NamedEntity(representative: Mention, ner: String, coRefs: List[Mention])
    case class Result(namedEntities: List[NamedEntity])
so each named entity has a `representative` mention, a type `ner` which can be "PERSON", "LOCATION" etc. and a list of other mentions `coRefs` (which is empty unless the selected NLP implimentation is `Stanford CoreNLP NER + Coref `.

If ` Heuristic post-processing` is selected then code in the UI modifies this data, deleting some NamedEntity items and replacing some with coRefs.

Data structure for the redaction request:

    case class RedactItem(page: Int, start: Int, end: Int)
    case class Redact(redact: List[RedactItem])
Note that an item to be redacted is specified by page based character offsets into the extracted text. This won't work if the user starts at step 2 or modified the text at step 2. Page number is 1 based (PDF convention), char offsets are 0 based.


See also: [t3as-pdf](https://github.com/NICTA/t3as-pdf) which provides the PDF functionality used by this project.

### Legal

This software is released under the terms of the [AGPL](http://www.gnu.org/licenses/agpl-3.0.en.html). Source code for all transitive dependencies is available at [t3as-legal](https://github.com/NICTA/t3as-legal).

### Build

 Build and publish to your local Ivy repository (but this depends on  [t3as-pdf](https://github.com/NICTA/t3as-pdf) so do that first):
 
    sbt publishLocal

###Run

To run the webapp from sbt (unresolved OutOfMemoryError - needs to fork a jvm with -Xmx3g):

    sbt
    > container:start
    
... or install target/scala-2.11/redact_2.11-0.1.war (as redact.war) in the container of your choice.

