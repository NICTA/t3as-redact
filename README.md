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
1. user can edit the extracted text in the `Input Text` section or alternatively the user can skip step 1 and start by pasting in text - note that either of these actions will stop the final redaction step from working properly (this feature is useful in the prototype UI, but will not appear in the production UI);
1. perform named entity recognition on the text, optionally with co-references (identifying subsequent references to the same entity);
1. user can manipulate the named entity mentions highlighted in the `Processed Text` section:
  - delete,
  - create,
  - modify type and extent;
1. user can manupulate named entity type and representative mention/coRef relationships in the `Entities Tree` section - here 'source' refers to a representative mention or coRef:
  - drag source to a new type to change the type of the source (and its children),
  - drag source to a destination representative mention to make the source (and its children) children of the destination;
1. select representative mentions to redact and a reason for redaction;
1. perform redaction of selected representative mentions and their coRefs: the PDF is uploaded again (the server is stateless) and the redacted PDF is downloaded with selected named entities and their co-references removed and metadata removed.

Required functionality not yet provided:
- show the reason for redaction at each redacted location in the PDF
- support separate markup and review processes prior to actual redaction (maybe related to next item)
- interoperate with Adobe tools by using standard metadata for redactions 

### Implementation

Data structure for the result of named entity recognition:
    
    case class Mention(start: Int, end: Int, text: String)
    case class NamedEntity(representative: Mention, ner: String, coRefs: List[Mention])
    case class Result(namedEntities: List[NamedEntity])
so each named entity has a `representative` mention, a type `ner` which can be "PERSON", "LOCATION" etc. and a list of other mentions `coRefs` (which is empty unless the selected NLP implimentation is `Stanford CoreNLP NER + Coref `.

If `Heuristic post-processing` is selected then code in the UI modifies this data, deleting some NamedEntity items and replacing some with coRefs.

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

To run the webapp from sbt (this and the unit tests need lots of memory, hence the -J-Xmx bit):

    sbt -J-Xmx3G
    > container:start
    
... or install target/scala-2.11/redact_2.11-0.1.war (as redact.war) in the container of your choice.

