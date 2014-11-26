// class to insert markup into input string
function Markup(input) {
  this.input = input;
  this.output = input; // marked up text
  this.offsets = []; // array of { inputIdx: orig index, offset: number of chars inserted at this point }
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
    url : baseUrl + '/extractText',
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
  
  var elem = clearResults();
  var txt = $('#inputText textarea').val();  

  function genContentPP(elem, data) {
    genContent(elem, txt, $('#nerPostProcess').is(':checked') ? postProcess(data) : data);
  }
  
  switch ($('#inputText input[name=nerImpl]:checked').attr('id')) {
  case 'nerImplOpenNLP':
    ajaxPost(baseUrl + '/opennlp/json', {text: txt, withCoref: false}, elem, genContentPP) 
	  break;
  case 'nerImplCoreNLPCoref':
    ajaxPost(baseUrl + '/corenlp/json', {text: txt, withCoref: true}, elem, genContentPP) 
    break;
  case 'nerImplCoreNLP':
    ajaxPost(baseUrl + '/corenlp/json', {text: txt, withCoref: false}, elem, genContentPP) 
    break;
  default:
    elem.empty();
    addSpinner(elem);
    $.ajax({
      type : 'POST',
      url : 'http://ner.t3as.org/nicta-ner-web/rest/v1.0/ner',
      contentType : 'application/x-www-form-urlencoded; charset=UTF-8',
      data : encodeURIComponent(txt),
      dataType : 'json',
      success : function(data, textStatus, jqXHR) {
        debug('namedEntityRecognitionNicta success:', 'data =', data, 'textStatus =', textStatus, 'jqXHR =', jqXHR);
        genContentPP(elem, transformNictaNER(data, txt));
      },
      error : ajaxError
    });
    break;
  };
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


/**
 * Set of String values.
 */
function Set() {
  this.obj = {};
  this.splitRe = / +/;
};
Set.prototype.add = function(k) {
  this.obj[k] = k;
};
Set.prototype.contains = function(k) {
  return k in this.obj;
};
/** Split s into words and add each word */
Set.prototype.addWords = function(s) {
  var w = s.split(this.splitRe);
  for (var i = 0; i < w.length; i++) { this.add(w[i]); };
};
/** Split s into words and return true iff we contain all the words */
Set.prototype.containsWords = function(s) {
  var w = s.split(this.splitRe);
  for (var i = 0; i < w.length; i++) { if (!this.contains(w[i])) return false; };
  return true;
};

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

var savedData;

function genContent(elem, txt, data) {
  savedData = data;
  elem.empty();
  elem.append(markup(data, txt));

  var treeData = toTreeData(data);
  debug('genContent:', 'treeData =', treeData);
  updateTree = updateTree(treeData); // create/update tree, return function to update existing tree
  // $("#tree-container text").on("mouseenter", highlight).on("mouseleave", unhighlight);
  
  $.each(tableConfig, function(idx, p) {
    populate(p.parent, p.classes, p.label, data);
  });
  $("#entities input[type='text']").attr('class', 'hidden'); // reason hidden until checkbox ticked
  $("#entities span[ref]").on("mouseenter", highlightEv).on("mouseleave", unhighlightEv);
  $("#entities input[type='checkbox']").on('change', redact);
};

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
    // debug('populate.map:', 'classes =', classes, 'x.ner =', x.ner);
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
  // debug('populate:', 'rows.length =', rows.length, 'rows =', rows);
  
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
  ev.preventDefault();
  var val = $(ev.target).attr(name);
  // debug('get: ev =', ev, name, '=', val);
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
    var ne = savedData.namedEntities[$(x).attr('ref')]; // lookup namedEntity using each checkbox ref attr
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
  f.attr('action', baseUrl + "/redact");
  $('input[name="redact"]', f).val(JSON.stringify( { redact: redact } ));
  f.submit();
}

function neEdit(range) {
  var createType = $('#neCreate input:checked').attr('value');
  var editType = $('#neEdit input:checked').attr('value');
  debug('neEdit: range', range, 'createType', createType, 'editType', editType);
  if (range.endOffset !== range.startOffset || range.startContainer !== range.endContainer) {
    var elem = $("#processedText");
    var txt = $('#inputText textarea').val();
    var str = getTextOffset(range.startOffset, range.startContainer, elem);
    var strNeRef = findNeRef(savedData, str);
    var end = getTextOffset(range.endOffset, range.endContainer, elem);
    var endNeRef = findNeRef(savedData, end);
    var neRef = strNeRef.combine(endNeRef);
    debug('neEdit:', 'str', str, 'strNeRef', strNeRef, 'end', end, 'endNeRef', endNeRef, 'neRef', neRef);
    if (neRef.neIdx === -1) {
      savedData.namedEntities.push({ 
        ner: createType, 
        representative: { start: str, end: end, text: txt.slice(str, end) },
        coRefs: []
      });
    } else {
      var ne = savedData.namedEntities[neRef.neIdx];
      if (editType === 'deleted') {
        if (neRef.corefIdx === -1) savedData.namedEntities.splice(neRef.neIdx, 1);
        else ne.coRefs.splice(neRef.corefIdx, 1);
      } else {
        if (editType === 'changed') ne.ner = createType;
        var m = neRef.corefIdx === -1 ? ne.representative : ne.coRefs[neRef.corefIdx];
        m.start = str;
        m.end = end;
        m.text = txt.slice(str, end);
      };
    }
    debug('neEdit:', 'savedData', savedData);
    var elem = clearResults();
    genContent(elem, txt, savedData);
  };
};

/**
 * Get text offset relative to elem.
 * @param offset relative to container
 * @param container a text node
 * @param elem ancestor of container
 * @return offset + sum of lengths of all text nodes under elem which preceed containiner 
 */
function getTextOffset(offset, container, elem) {
  var txts = getTextDescendantsInDocOrder(elem);
  var find = txts.indexOf(container);
  var sum = offset;
  for (i = 0; i < find; ++i) sum += txts[i].length;
  return sum;
};

function NeRef(neIdx, corefIdx) {
  this.neIdx = neIdx;
  this.corefIdx = corefIdx;
};
NeRef.prototype.eq = function(x) {
  return this.neIdx === x.neIdx && this.corefIdx === x.corefIdx;
};
NeRef.prototype.combine = function(x) {
  return x.neIdx === -1 || this.eq(x) ? this 
    : this.neIdx === -1 ? x
    : new NeRef(-1, -1);
};

/**
 * Find the first representative or coref mention that covers the given offset.
 * TODO: with post processing there will only be one, but without there may be multiple overlapping mentions, so maybe we should return all of them.
 * @param data namedEntities
 * @param offset
 * @returns { neIdx: neIdx, corefIdx: corefIdx } with -1 for not found
 */
function findNeRef(data, offset) {
  function inM(m) { return m.start <= offset && offset < m.end; };
  for (neIdx = 0; neIdx < data.namedEntities.length; ++neIdx) {
    var ne = data.namedEntities[neIdx];
    if (inM(ne.representative)) return new NeRef(neIdx, -1); // -1 for corefIdx because its found in representative mention
    for (corefIdx = 0; corefIdx < ne.coRefs.length; ++corefIdx) {
      if (inM(ne.coRefs[corefIdx])) return new NeRef(neIdx, corefIdx);
    };
  };
  return new NeRef(-1, -1);
};

var baseUrl;
var tableConfig;
var updateTree;

$(document).ready(function() {
  baseUrl = window.location.protocol === 'file:'
    ? 'http://localhost:8080/redact/rest/v1.0' // use this when page served from a local file during dev
    : '/redact/rest/v1.0';                     // use this when page served from webapp

  $("#extractText input[type=file]").on('change', function(ev) { pdfFile = ev.target.files; });
  $("#extractText button").on('click', extractText);
  $("#inputText button").on('click', processText);
  $("#processedText").on('mouseup', function(ev) { neEdit(window.getSelection().getRangeAt(0)); });
  $("#redactPdf button").on('click', redactPdf);
  
  // map multiple class names used by the different NERs to one class name used in the UI
  tableConfig = [
    { parent : $('#people'), classes : [ 'PERSON' ], label : 'Person' },
    { parent : $('#organizations'), classes : [ 'ORGANIZATION', 'UNKNOWN' ], label : 'Organization' },
    { parent : $('#locations'), classes : [ 'LOCATION' ], label : 'Location' },
    { parent : $('#dates'), classes : [ 'DATE', 'TIME' ], label : 'Date, time, duration' },
    { parent : $('#numbers'), classes : [ 'NUMBER', 'PERCENT', 'PERCENTAGE', 'MONEY' ], label : 'Number' }
  ];
  
  $("#neCreate").append(mkRadios(
    $.map(tableConfig, function(x, idx) {
      var v = x.classes[0];
      return { id: 'neCreate_' + v, value: v, label: x.label };
    }),
    'neCreate',
    0));
  
  $("#neEdit").append(mkRadios(
    [
      { id: 'neEditUnchanged', value: 'unchanged', label: 'unchanged' },
      { id: 'neEditChanged', value: 'changed', label: 'changed to type selected above' },
      { id: 'neEditDelete', value: 'deleted', label: 'deleted' }
    ],
    'neEdit',
    0));
  
  updateTree = mkTree;  
});
