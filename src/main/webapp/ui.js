function debug() {
  console.log(arguments);
}

function ajaxError(jqXHR, textStatus, errorThrown) {
  debug('ajaxError: jqXHR =', jqXHR, 'textStatus =', textStatus, 'errorThrown =', errorThrown);
}

// class to insert markup into input string
function Markup(input) {
  this.input = input;
  this.output = input; // marked up text
  this.offsets = []; // array of { inputIdx: orig index, offset: number of chars inserted inserted at this point }
}

// insert text at input index pos
Markup.prototype.insert = function(pos, text) {
  var i = this.outputIdx(pos);
  this.output = this.output.substring(0, i) + text + this.output.substring(i);
  this.offsets.push({ inputIdx : pos, offset : text.length });
  // debug('Markup:insert:', 'output =', this.output, 'offsets =', this.offsets);
};

// map input index inputIdx to output index
Markup.prototype.outputIdx = function(inputIdx) {
  var sum = inputIdx;
  $.each(this.offsets, function(idx, x) {
    if (x.inputIdx <= inputIdx) sum += x.offset;
  });
  // debug('Markup:index:', 'inputIdx =', inputIdx, 'sum =', sum);
  return sum;
};

function markup(data, text) {
  // ref refers to a named entity and all (co)refs to it
  // mention refers to one specific mention
  var d = $.map(data.namedEntities, function(ne, neIdx) {
    var mentions = $.map(ne.coRefs, function(cr, crIdx) {
      return { ref: neIdx, mention: neIdx + '_' + crIdx, ner: ne.ner, start: cr.start, end: cr.end };
    });
    mentions.push({ ref: neIdx, ner: ne.ner, start: ne.representative.start, end: ne.representative.end });
    return mentions;
  }).sort(function(a, b) {
    // sort by start descending, end descending so that an outer span "Minnie
    // and I" will be processed before inner spans "Minnie" and "I".
    var x = b.start - a.start;
    if (x !== 0) return x;
    else return b.end - a.end;
  });
  // debug('markup: sorted mentions d =', d);

  var m = new Markup(text);
  $.each(d, function(idx, x) {
    m.insert(x.start,  '<span class="' + x.ner.toLowerCase() + '" ref="' + x.ref + '"' + (x.mention ? ' mention="' + x.mention + '"' : '') + '>');
    m.insert(x.end, '</span>');
  });
  return m.output;
}

var pdfFile;
// var redactBaseUrl = '/redact/rest/v1.0'; // for prod leave out the host part so browser will use same server we came from
// var redactBaseUrl = 'http://localhost:8080/redact/rest/v1.0'; // for dev use localhost so it will work when we come from a file:// url
var redactBaseUrl = 'http://redaction.research.nicta.com.au:8080/redact/rest/v1.0'; // for dev use prod host so it will work when we come from a file:// url
var nictaNerUrl = 'http://ner.t3as.org/nicta-ner-web/rest/v1.0/ner';

function clearResults() {
  var p = $('#processedText');
  p.empty();
  $.each(tableConfig, function(idx, p) {
    p.parent.empty();
  });
  return p;
}

function PageOffsets(pages) {
  var pageSeparator = "\n\n";
  var sum = 0;
  var offsets = [];
  $.each(pages, function(idx, page) {
    offsets[idx] = sum;
    sum += page.length + pageSeparator.length;
  });
  
  this.offsets = offsets;
  this.pageSeparator = pageSeparator;  
}

// input: str, end offsets into whole text (concatenated pages)
// output: {pageNum, str, end} 1 based page that input str falls on and str, end relative to this page
PageOffsets.prototype.getPageOffset = function(str, end) {
  var i = 0;
  while (i < this.offsets.length && this.offsets[i] <= str) { i++; };
  var off = this.offsets[i - 1];
  var r = {page: i, start: str - off, end: end - off};
  debug('PageOffsets.getPageOffset:', 'str', str, 'end', end, 'r', r);
  return r;
};

var pageOffsets;

function extractText(ev) {
  debug('extractText: ev =', ev);
  ev.preventDefault();
  
  var p = clearResults();
  
  var formData = new FormData();
  formData.append('pdfFile', pdfFile[0]);
  debug('extractText: pdfFile =', pdfFile, 'formData =', formData);
  
  $.ajax({
    type : 'POST',
    url : redactBaseUrl + '/extractText',
    data :  formData,
    contentType: false, // http://abandon.ie/notebook/simple-file-uploads-using-jquery-ajax, https://github.com/Abban/jQueryFileUpload/blob/master/script.js
    processData: false,
    dataType : 'json',
    cache: false,
    success : function(data, textStatus, jqXHR) {
      debug('extractText success:', 'data =', data, 'textStatus =', textStatus, 'jqXHR =', jqXHR);
      pageOffsets = new PageOffsets(data.pages);
      debug('extractText success:', 'pageOffsets =', pageOffsets);
      $('#inputText textarea').val(data.pages.join(pageOffsets.pageSeparator));
      $('#processedText').empty();
    },
    error : ajaxError
  });
  
  p.append($('<img>').attr({src: "ajax-loader.gif", alt: "spinner"})); // add spinner unless exception
}

function processText(ev) {
  debug('processText: ev =', ev);
  ev.preventDefault();
  
  var p = clearResults();

  var txt = $('#inputText textarea').val();  
  switch ($('#inputText input[name=nerImpl]:checked').attr('id')) {
  case 'nerImplOpenNLP':
    namedEntityRecognition(redactBaseUrl + '/opennlp/json', txt, false);
	  break;
  case 'nerImplCoreNLPCoref':
    namedEntityRecognition(redactBaseUrl + '/corenlp/json', txt, true);
    break;
  case 'nerImplCoreNLP':
    namedEntityRecognition(redactBaseUrl + '/corenlp/json', txt, false);
    break;
  default:
    namedEntityRecognitionNicta(txt);
    break;
  }
  
  p.append($('<img>').attr({src: "ajax-loader.gif", alt: "spinner"})); // add spinner unless exception
}

function namedEntityRecognition(url, txt, withCoref) {
  $.ajax({
    type : 'POST',
    url : url,
    contentType : 'application/json; charset=UTF-8',
    data :  JSON.stringify( {text: txt, withCoref: withCoref} ),
    dataType : 'json',
    success : function(data, textStatus, jqXHR) {
      debug('namedEntityRecognition success:', 'data =', data, 'textStatus =', textStatus, 'jqXHR =', jqXHR);
      handleResult(data, txt);
    },
    error : ajaxError
  });
}

function namedEntityRecognitionNicta(txt) {
  debug('namedEntityRecognitionNicta:', 'txt =', txt);
  $.ajax({
    type : 'POST',
    url : nictaNerUrl,
    contentType : 'application/x-www-form-urlencoded; charset=UTF-8',
    data : encodeURIComponent(txt),
    dataType : 'json',
    success : function(data, textStatus, jqXHR) {
      debug('namedEntityRecognitionNicta success:', 'data =', data, 'textStatus =', textStatus, 'jqXHR =', jqXHR);
      handleResult(transformNictaNER(data, txt), txt);
    },
    error : ajaxError
  });
}

/**
 * Transform response from NICTA NER into same format as CoreNLP service
 * 
 * @param data response from NICTA NER, format:
 * <pre>
 * [ 
 *   [                                                         // one inner array per sentence
 *     {                                                       // one struct per phrase 
 *       phrase: [ { startIndex: 0, text: "Mickey" }, ... ],   // the words in the phrase
 *       phraseType: "PERSON"                                  // the class of named entity
 *     }, ...
 *   ], 
 * ... ]
 * </pre>
 * @param txt input text
 * @returns data in same format as CoreNLP service
 */
function transformNictaNER(data, txt) {
  var ners = $.map(data.phrases, function(sentence, sIdx) {
    return $.map(sentence, function(x, xIdx) { 
      var str = x.phrase[0].startIndex;
      var last = x.phrase[x.phrase.length - 1];
      var end = last.startIndex + last.text.length;
      debug('transformNictaNER:', 'x =', x, 'str =', str, 'end =', end, 'last =', last);
      return {
        representative : { start : str, end : end, text : txt.substring(str, end) },
        ner : x.phraseType.entityClass,
        coRefs : []
      };
    });
  });
  
  var d = { namedEntities : ners };
  debug('transformNictaNER:', 'd =', d);
  return d;
};


var namedEntities;

function handleResult(data, txt) {
  if ($('#nerPostProcess').is(':checked')) data = postProcess(data);
  namedEntities = data.namedEntities;
  
  var p = $('#processedText');
  p.empty();
  p.append(markup(data, txt));

  var treeData = toTreeData(data);
  debug('handleResult:', 'treeData =', treeData);
  updateTree = updateTree(treeData); // create/update tree, return function to update existing tree
  // $("#tree-container text").on("mouseenter", highlight).on("mouseleave", unhighlight);
  
  $.each(tableConfig, function(idx, p) {
    populate(p.parent, p.classes, p.label, data);
  });
  $("#entities input[type='text']").attr('class', 'hidden'); // reason hidden until checkbox ticked
  $("#entities span[ref]").on("mouseenter", highlightEv).on("mouseleave", unhighlightEv);
  $("#entities input[type='checkbox']").on('change', redact);
}

/**
 * Set of String values.
 */
function Set() {
  this.obj = {};
  this.splitRe = / +/;
}
Set.prototype.add = function(k) {
  this.obj[k] = k;
}
Set.prototype.contains = function(k) {
  return k in this.obj;
}
/** Split s into words and add each word */
Set.prototype.addWords = function(s) {
  var w = s.split(this.splitRe);
  for (var i = 0; i < w.length; i++) { this.add(w[i]); };
}
/** Split s into words and return true iff we contain all the words */
Set.prototype.containsWords = function(s) {
  var w = s.split(this.splitRe);
  for (var i = 0; i < w.length; i++) { if (!this.contains(w[i])) return false; };
  return true;
}

/**
 * Heuristic post processing of NER result.
 * Rules:<ol>
 * <li>delete any items longer than 80 chars
 * <li>treat subsequent item of same type and same text as coref
 * <li>if type is PERSON the 'same text' criteria is relaxed so that if the subsequent item contains only words contained in the first mention it is considered a match,
 *     so that 'Abbott' or 'Tony' will be taken to be a reference to a preceding 'Tony Abbott'.
 * </ol>
 * In/output object of type Result:<pre>
 *   case class Result(namedEntities: List[NamedEntity])
 *   case class NamedEntity(representative: Mention, ner: String, coRefs: List[Mention])
 *   case class Mention(start: Int, end: Int, text: String)
 * </pre>  
 * @param data
 * @return modified data
 * 
 * Bug: with Tim de Sousa PDF text; CoreNLP + coRef
 * First result ne has: representative text = Tim de Sousa, start = 64, end = 76 and coref[1] is the same!
 * Oh, it's not my bug, that is in the data produced by CoreNLP. Looks like we have to filter that!
 * 
 * Mouse over scrolling on the tree doesn't work on the representative mention for Tim de Sousa, seems to work on all other nodes though.
 */
function postProcess(data) {
  debug('postProcess:', 'data =', data);
  
  var neMap = {
    map: {}, // key -> { ne: the ne, words: Set of words in ne.representative.text } 
    key: function(ne) { return ne.ner + '~' + ne.representative.text; },
    predicate: function(m) { return m.text.length <= 80; }, //rule 1
    comparitor: function(a,b) {                                          // sort
      var i = a.representative.start - b.representative.start;           // start ascending
      return i != 0 ? i : b.representative.end - a.representative.end;   // then end descending (to get longest one first)
    },
    NOT_FOUND: '',
    EMPTY_SET: new Set(),
    lookupKey: function(k, ne) {
      if (k in this.map) return k; // rule 2
      if (ne.ner === 'PERSON') { // rule 3
        for (p in this.map) {
          var v = this.map[p];
          if (v.ne.ner === 'PERSON' && v.words.containsWords(ne.representative.text)) return p;
        };
      };
      return this.NOT_FOUND;
    },
    add: function(ne) {
      var k = this.key(ne);
      var p = this.lookupKey(k, ne);
      if (p === this.NOT_FOUND) {
        // save first mention
        var words = this.EMPTY_SET;
        if (ne.ner === 'PERSON') {
          words = new Set();
          words.addWords(ne.representative.text);
        };
        this.map[k] = { ne: ne, words: words };
      } else {
        // append this ne (including its corefs) as corefs to previous mention
        var prev = this.map[p].ne;
        prev.coRefs = prev.coRefs.concat(ne.representative, ne.coRefs).filter(this.predicate);
      };
    },
    addAll: function(nes) {
      nes.sort(this.comparitor);
      for (var i = 0; i < nes.length; i++) {
        var ne = nes[i];
        if (this.predicate(ne.representative)) {
          neMap.add(ne);
        } else {
          // skip representative mention, but add corefs
          var corefs = ne.coRefs.filter(this.predicate);
          if (corefs.length > 0) {
            corefs.sort(this.comparitor);
            ne.representative = corefs[0];
            ne.coRefs = corefs.slice(1);
            neMap.add(ne);
          };
        }
      };
    },
    result: function() {
      return $.map(this.map, function(v, k) {
        return v.ne;
      });
    }
  };
  
  neMap.addAll(data.namedEntities);
  var r = { namedEntities: neMap.result() };
  debug('postProcess:', 'return =', r);
  return r;
}

/**
 * Transform data in format of CoreNLP service to a tree for display by dndTree.js
 * @param data
 * @returns treeData
 */
function toTreeData(data) {
  // return root of tree
  return {
    "name": "Entities",
    "children": $.map(tableConfig, function(p, idx) {
      // 1st level: entity types: Person, Organization etc.
      return {
        name: p.label,
        children: $.map(data.namedEntities, function(x, idx) {
          // 2nd level: representative instances of their parent's type
          if (p.classes.indexOf(x.ner) === -1) return undefined;
          return {
            name: x.representative.text,
            ref: idx,
            start: x.start,
            end: x.end,
            children: $.map(x.coRefs, function(x, idx2) {
              // 3rd level: co-references to the same entity as their representative parent
              return {
                name: x.text,
                ref: idx, // same as parent
                mention: idx + '_' + idx2,
                start: x.start,
                end: x.end,
              };
            })
          };
        })
      }
    })
  };
}

// TODO: use data attached to elements instead of non-standard attributes ref and mention?

/**
 * Generate a table of named entities.
 * @param parent that the table is appended to
 * @param classes of named entities to include in this table (skip data rows for other classes)
 * @param label displayed to represent these classes
 * @param data as returned by the CoreNLP service or transformNictaNER
 */
function populate(parent, classes, label, data) {
  var td = function(s) { return $('<td>').append(s); };
  var rows = $.map(data.namedEntities, function(x, idx) {
    debug('populate.map:', 'classes =', classes, 'x.ner =', x.ner);
    if (classes.indexOf(x.ner) === -1) return undefined;
    // createTextNode properly escapes the text
    return $('<tr>').append(
        td($('<span>').attr({ ref : idx }).append(document.createTextNode(x.representative.text)))
      ).append(
        td($('<input>').attr({ type : 'checkbox', ref : idx }))
      ).append(
        td($('<input>').attr({ type : 'text', ref : idx }))
      );
  });
  debug('populate:', 'rows.length =', rows.length, 'rows =', rows);
  
  parent.empty();
  if (rows.length > 0) {
    var th = function(s) { return $('<th>').append(s); };
    var hrow = $('<tr>').append(
        th($('<span>').attr({ class : classes[0].toLowerCase() }).append(label))
      ).append(
        th('Redacted')
      ).append(
        th('Reason')
      );
    parent.append(
      $('<table>').append(
        $('<thead>').append(hrow)
      ).append(
        $('<tbody>').append(rows)
      )
    );
  }
}

function getEvAttr(ev, name) {
  var t = $(ev.target);
  var val = t.attr(name);
  debug('get: ev =', ev, name, '=', val);
  ev.preventDefault();
  return val;
}

function toSelection(name, val) { return 'span[' + name + '="' + val + '"]'; }

function highlightEv(ev) { highlightRef(getEvAttr(ev, 'ref')); }
function highlightRef(ref) { highlightSel(toSelection('ref', ref)); }
function highlightMention(mention) { highlightSel(toSelection('mention', mention)); }

function highlightSel(selection) {
  var p = $('#processedText');
  var s = $(selection, p);
  s.addClass('highlight');
  // http://stackoverflow.com/questions/2346011/jquery-scroll-to-an-element-within-an-overflowed-div
  p.animate({ scrollTop: p.scrollTop() + s.first().position().top }, 1000);
}

function unhighlightEv(ev) { unhighlightRef(getEvAttr(ev, 'ref')); }
function unhighlightRef(ref) { unhighlightSel(toSelection('ref', ref)); }
function unhighlightMention(mention) { unhighlightSel(toSelection('mention', mention)); }

function unhighlightSel(selection) {
  var p = $('#processedText');
  var s = $(selection, p);
  s.removeClass('highlight');
}

function redact(ev) {
  var t = $(ev.target);
  var ref = '[ref=' + t.attr('ref') + ']';
  debug('redact: ev =', ev, 'ref =', ref);
  ev.preventDefault();
  var spans = $('#processedText span' + ref);
  var reason = $('#entities input[type=text]' + ref);
  if (t.is(':checked')) {
    spans.addClass('redacted');
    reason.removeClass('hidden');
  } else {
    spans.removeClass('redacted');
    reason.addClass('hidden');
  }
}

function redactPdf(ev) {
  var redact = $.map($("#entities input[type='checkbox']:checked"), function(x, idx) {
    var ne = namedEntities[$(x).attr('ref')]; // lookup namedEntity using each checkbox ref attr
    // flatten the representative ne and its coRefs
    var arr = [];
    arr.push(ne.representative);
    arr.concat(ne.coRefs);
    return $.map(arr, function(a, idx) {
      return pageOffsets.getPageOffset(a.start, a.end); // convert offsets into text from all pages to page and offset within page
    });
  });
  debug('redactPdf: redact =', redact);
  
  var f = $('#redactForm');
  f.attr('action', redactBaseUrl + "/redact");
  $('input[name="redact"]', f).val(JSON.stringify( { redact: redact } ));
  f.submit();
}

var tableConfig;
var updateTree;

$(document).ready(function() {
  $("#extractText input[type=file]").on('change', function(ev) { pdfFile = ev.target.files; });
  $("#extractText button").on('click', extractText);
  $("#inputText button").on('click', processText);
  $("#redactPdf button").on('click', redactPdf);
  
  // map multiple class names used by the different NERs to one class name used in the UI
  tableConfig = [
    { parent : $('#people'), classes : [ 'PERSON' ], label : 'Person' },
    { parent : $('#organizations'), classes : [ 'ORGANIZATION' ], label : 'Organization' },
    { parent : $('#locations'), classes : [ 'LOCATION' ], label : 'Location' },
    { parent : $('#dates'), classes : [ 'DATE', 'TIME' ], label : 'Date, time, duration' },
    { parent : $('#numbers'), classes : [ 'NUMBER', 'PERCENT', 'PERCENTAGE', 'MONEY' ], label : 'Number' }
  ];
  
  updateTree = mkTree;
});