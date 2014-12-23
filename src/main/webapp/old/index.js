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

function markup(namedEntities, text) {
  var d = $.map(namedEntities, function(ne, neIdx) {
    // array of coRefs + representative mention
    var r = $.map(ne.coRefs, function(cr, coRefIdx) {
      return { neIdx: neIdx, coRefIdx: coRefIdx, ner: ne.ner, start: cr.start, end: cr.end };
    });
    r.push({ neIdx: neIdx, ner: ne.ner, start: ne.representative.start, end: ne.representative.end });
    return r;
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
    var t = '<span class="' + x.ner.toLowerCase() + '" neIdx="' + x.neIdx + '"' + (typeof x.coRefIdx === 'undefined' ? '' : ' coRefIdx="' + x.coRefIdx + '"') + '>';
    // debug('markup: t =', t, 'text', text.slice(x.start, x.end), 'x', x);
    m.insert(x.start, t);
    m.insert(x.end, '</span>');
  });
  // debug('markup: output', m.output);
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
    genContent(elem, txt, conditionalPostProcess(data.namedEntities));
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
 * [                                                           // array of sentences
 *   [                                                         // array of phrases in sentence 
 *     {                                                       // struct per phrase 
 *       phrase: [ { startIndex: 0, text: "Mickey" }, ... ],   // words in phrase
 *       phraseType: "PERSON"                                  // class of named entity
 *     }, ...
 *   ], 
 * ... ]
 * </pre>
 * @param txt input text
 * @returns namedEntities in same format as CoreNLP service
 */
function transformNictaNER(data, txt) {
  var ners = $.map(data.phrases, function(sentence, sIdx) {
    return $.map(sentence, function(x, xIdx) { 
      var str = x.phrase[0].startIndex;
      var last = x.phrase[x.phrase.length - 1];
      var end = last.startIndex + last.text.length;
      // debug('transformNictaNER:', 'x =', x, 'str =', str, 'end =', end, 'last =', last);
      return {
        representative : { start : str, end : end, text : txt.substring(str, end) },
        ner : x.phraseType.entityClass,
        coRefs : []
      };
    });
  });
  return { namedEntities: ners };
};


/**
 * Set of String values.
 */
function Set() {
  this.obj = {};
};
Set.prototype.add = function(k) {
  this.obj[k] = k;
};
Set.prototype.contains = function(k) {
  return k in this.obj;
};
/** Split s into words and add each word */
Set.prototype.addWords = function(s) {
  var w = s.split(/ +/);
  for (var i = 0; i < w.length; i++) { this.add(w[i]); };
};
/** Split s into words and return true iff we contain all the words */
Set.prototype.containsWords = function(s) {
  var w = s.split(/ +/);
  for (var i = 0; i < w.length; i++) { if (!this.contains(w[i])) return false; };
  return true;
};

function conditionalPostProcess(namedEntities) {
  return $('#nerPostProcess').is(':checked') ? postProcess(namedEntities) : namedEntities;
}

/**
 * @param acro the purported acronym
 * @param term the term
 * @returns {Boolean} true if acro is the acronym of term
 */
function isAcronym(acro, term) {
  var arr = term.split(/ +/);
  var ac = '';
  for (i  = 0; i < arr.length; ++i) {
    ac += arr[i].charAt(0).toUpperCase();
  };
  debug('isAcronym: ', 'acro', acro, 'term', term, 'ac', ac);
  return ac === acro;
}

/**
 * Heuristic post processing of NER result.
 * Rules:<ol>
 * <li>delete any items longer than 80 chars
 * <li>treat subsequent item of same type and same text as coref
 * <li>if type is PERSON the 'same text' criteria is relaxed so that if the subsequent item contains only words contained in the first mention it is considered a match,
 *     so that 'Abbott' or 'Tony' will be taken to be a reference to a preceding 'Tony Abbott'.
 * <li>exclude common titles Mr|Mrs|Miss|Ms|Dr from above matching for PERSON.
 * <li>same as rule 3 but for ORGANIZATION.
 * <li>for ORGANIZATION also accept an acronym.
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
function postProcess(namedEntities) {
  debug('postProcess:', 'namedEntities =', namedEntities);
  
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
      if (ne.ner === 'PERSON') {
        for (p in this.map) {
          var v = this.map[p];
          //                                   rule 3                               rule 4
          if (v.ne.ner === 'PERSON' && v.words.containsWords(ne.representative.text.replace(/\b(?:Mr|Mrs|Miss|Ms|Dr)\.? /, ''))) return p;
        };
      };
      if (ne.ner === 'ORGANIZATION') {
        for (p in this.map) {
          var v = this.map[p];
          //                                          rule 5                                   rule 6
          if (v.ne.ner === 'ORGANIZATION' && (v.words.containsWords(ne.representative.text) || isAcronym(ne.representative.text, v.ne.representative.text))) return p;
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
        if (ne.ner === 'PERSON' || ne.ner === 'ORGANIZATION') {
          words = new Set();
          words.addWords(ne.representative.text); // rules 3 & 5
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
  
  neMap.addAll(namedEntities);
  var r = neMap.result();
  debug('postProcess:', 'return =', r);
  return r;
}

var savedNamedEntities;

function getTarget(ev) { return $(ev.target); }
function getNeIdx(t) { return t.attr('neIdx'); }

function genContent(elem, txt, namedEntities) {
  savedNamedEntities = namedEntities;
  elem.empty();
  elem.append(markup(namedEntities, txt));

  var treeData = toTreeData(namedEntities);
  debug('genContent:', 'namedEntities', namedEntities, 'treeData =', treeData);
  updateTree = updateTree(treeData, {highlight: highlight, unhighlight: unhighlight, move: move}); // create/update tree, return function to update existing tree
  
  $.each(tableConfig, function(idx, p) {
    genNeTable(p.parent, p.classes, p.label, namedEntities);
  });
  
  var elem = $('#entities');
  $("input[type='text']", elem).attr('class', 'hidden'); // reason hidden until checkbox ticked
  $("input[type='checkbox']", elem).on('change', redact);

  // mouse over highlights the entity in Processed Text
  $("span[neIdx]", elem)
    .on("mouseenter", function(ev) { highlight(getNeIdx(getTarget(ev))); })
    .on("mouseleave", function(ev) { unhighlight(getNeIdx(getTarget(ev))); });
};

/**
 * Transform data in format of CoreNLP service to a tree for display by dndTree.js
 * @param data
 * @returns treeData
 */
function toTreeData(namedEntities) {
  // return root of tree
  return {
    "name": "Entities",
    "children": $.map(tableConfig, function(p, idx) {
      // 1st level: entity types: Person, Organization etc.
      return {
        name: p.label,
        class: p.classes[0],
        children: $.map(namedEntities, function(ne, neIdx) {
          // 2nd level: representative instances of their parent's type
          var r = ne.representative;
          return p.classes.indexOf(ne.ner) === -1 ?  undefined : {
            name: r.text,
            neIdx: neIdx,
            start: r.start,
            end: r.end,
            children: $.map(ne.coRefs, function(cr, coRefIdx) {
              // 3rd level: co-references to the same entity as their representative parent
              return {
                name: cr.text,
                neIdx: neIdx, // same as parent
                coRefIdx: coRefIdx,
                start: cr.start,
                end: cr.end,
              };
            })
          };
        })
      }
    })
  };
};

/**
 * Generate a table of named entities.
 * @param parent that the table is appended to
 * @param classes of named entities to include in this table (skip data rows for other classes)
 * @param label displayed to represent these classes
 * @param namedEntities as returned by the CoreNLP service or transformNictaNER
 */
function genNeTable(parent, classes, label, namedEntities) {
  var td = function(s) { return $('<td>').append(s); };
  var rows = $.map(namedEntities, function(ne, neIdx) {
    // debug('genNeTable.map:', 'classes =', classes, 'ne.ner =', ne.ner);
    return classes.indexOf(ne.ner) === -1 ? undefined
      : $('<tr>').append(
        td($('<span>').attr({ neIdx: neIdx }).append(document.createTextNode(ne.representative.text))) // createTextNode properly escapes the text
      ).append(
        td($('<input>').attr({ type: 'checkbox', name: 'redact', neIdx: neIdx }))
      ).append(
        td($('<input>').attr({ type: 'text', name: 'reason', neIdx: neIdx }))
      );
  });
  // debug('genNeTable:', 'rows.length =', rows.length, 'rows =', rows);
  
  parent.empty();
  if (rows.length > 0) {
    var th = function(s) { return $('<th>').append(s); };
    parent.append(
      $('<table>').append(
        $('<thead>').append(
          $('<tr>').append(
            th($('<span>').attr({ class : classes[0].toLowerCase() }).append(label))
          ).append(
            th('Redacted')
          ).append(
            th('Reason')
          )
        )
      ).append(
        $('<tbody>').append(rows)
      )
    );
  }
}

// get jQuery attribute selector for elements to un/highlight
function getAttrSelector(neIdx, coRefIdx) {
  var x = '[neIdx=' + neIdx + ']';
  return typeof coRefIdx === 'undefined' ? x : x + '[coRefIdx=' + coRefIdx + ']';
};

/**
 * add highlight class, scroll to show top element
 * @param neIdx
 * @param coRefIdx coRef to highlight or undefined to highlight all mentions (representative + coRefs)
 */
function highlight(neIdx, coRefIdx) {
  debug('highlight:', 'neIdx', neIdx, 'coRefIdx', coRefIdx);
  var p = $('#processedText');
  var s = $('span' + getAttrSelector(neIdx, coRefIdx), p)
  s.addClass('highlight');
  // http://stackoverflow.com/questions/2346011/jquery-scroll-to-an-element-within-an-overflowed-div
  p.animate({ scrollTop: p.scrollTop() + s.first().position().top }, 1000);
}

// remove highlight class
function unhighlight(neIdx, coRefIdx) {
  var p = $('#processedText');
  $('span' + getAttrSelector(neIdx, coRefIdx), p).removeClass('highlight');
}

function redact(ev) {
  ev.preventDefault();
  var t = getTarget(ev);
  var sel = getAttrSelector(getNeIdx(t));
  
  debug('redact: ev =', ev, 'sel', sel);
  var spans = $('#processedText span' + sel);
  var reason = $('#entities input[type=text]' + sel);
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
    var neIdx = getNeIdx($(x));
    var ne = savedNamedEntities[neIdx]; // lookup namedEntity using each checkbox neIdx attr
    var sel = getAttrSelector(neIdx);
    var reason = $('#entities input[type=text]' + sel).val();
    // debug('redactPdf: ne =', ne);
    // flatten the representative ne and its coRefs
    return $.map([ ne.representative ].concat(ne.coRefs), function(a, idx) {
      var redactItem = pageOffsets.getPageOffset(a.start, a.end); // convert offsets into text from all pages to page and offset within page
      redactItem.reason = reason;
      return redactItem;
    });
  });
  debug('redactPdf: redact =', redact);
  
  var f = $('#redactForm');
  f.attr('action', baseUrl + "/redact");
  $('input[name="redact"]', f).val(JSON.stringify( { redact: redact } ));
  f.submit();
}

/**
 * Edit namedEntities according to user input.
 * @param range of text selected in the Processed Text
 */
function neEdit(range) {
  var createType = $('#neCreate input:checked').attr('value');
  var editType = $('#neEdit input:checked').attr('value');
  debug('neEdit: range', range, 'createType', createType, 'editType', editType);
  if (range.endOffset !== range.startOffset || range.startContainer !== range.endContainer) {
    var namedEntities = savedNamedEntities; // warning: following code is modifying savedNamedEntities in-place
    var elem = $("#processedText");
    var txt = $('#inputText textarea').val();
    var str = getTextOffset(range.startOffset, range.startContainer, elem);
    var strNeRef = findNeRef(namedEntities, str);
    var end = getTextOffset(range.endOffset, range.endContainer, elem);
    var endNeRef = findNeRef(namedEntities, end);
    var neRef = strNeRef.combine(endNeRef);
    debug('neEdit:', 'str', str, 'strNeRef', strNeRef, 'end', end, 'endNeRef', endNeRef, 'neRef', neRef);
    if (neRef.neIdx === -1) {
      namedEntities.push({ 
        ner: createType, 
        representative: { start: str, end: end, text: txt.slice(str, end) },
        coRefs: []
      });
    } else {
      var ne = namedEntities[neRef.neIdx];
      if (editType === 'deleted') {
        if (neRef.corefIdx === -1) namedEntities.splice(neRef.neIdx, 1);
        else ne.coRefs.splice(neRef.corefIdx, 1);
      } else {
        if (editType === 'changed') ne.ner = createType;
        var m = neRef.corefIdx === -1 ? ne.representative : ne.coRefs[neRef.corefIdx];
        m.start = str;
        m.end = end;
        m.text = txt.slice(str, end);
      };
    }
    namedEntities = conditionalPostProcess(namedEntities);
    debug('neEdit:', 'namedEntities', namedEntities);
    var elem = clearResults();
    genContent(elem, txt, namedEntities);
  };
};

/**
 * dndTree callback to move a node and recreate the tree.
 * @param neIdx for moved item
 * @param coRefIdx for moved item (undefined if its a representative mention)
 * @param newParentNeIdx new parent representative mention if we are to be a coRef (undefined if we are to be a representative mention)
 * @param newClass only to be used if we are to be a representative mention, otherwise (coRef) use class of parent representative mention
 */
function move(neIdx, coRefIdx, newParentNeIdx, newClass) {
  debug('move:', 'neIdx', neIdx, 'coRefIdx', coRefIdx, 'newParentNeIdx', newParentNeIdx, 'newClass', newClass);
  var namedEntities = savedNamedEntities;
  var ne = namedEntities[neIdx];
  if (typeof coRefIdx === 'undefined') {
    // moving a representative mention
    if (typeof newParentNeIdx === 'undefined') {
      // to a representative mention of a different class
      ne.ner = newClass;
    } else {
      // to a coRef of a different representative mention
      var pne = namedEntities[newParentNeIdx];
      namedEntities.splice(neIdx, 1);
      pne.coRefs.push(ne.representative);
      Array.prototype.push.apply(pne.coRefs, ne.coRefs); // also add coRefs of moved representative mention
    }
  } else {
    // moving a coRef
    var cr = ne.coRefs[coRefIdx];
    ne.coRefs.splice(coRefIdx, 1);
    if (typeof newParentNeIdx === 'undefined') {
      // to a representative mention
      namedEntities.push({ner: newClass, representative: cr, coRefs: []});
    } else {
      // to a coRef of a diffent representative mention
      namedEntities[newParentNeIdx].coRefs.push(cr);
    }
  };
  var elem = clearResults();
  var txt = $('#inputText textarea').val();
  updateTree = mkTree; // force recreation of tree from scratch, otherwise drag 'n drop gets messed up
  genContent(elem, txt, namedEntities);
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
function findNeRef(namedEntities, offset) {
  function inM(m) { return m.start <= offset && offset <= m.end; };
  for (neIdx = 0; neIdx < namedEntities.length; ++neIdx) {
    var ne = namedEntities[neIdx];
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
    : 'rest/v1.0';                             // use relative path when page served from webapp

  $("#extractText input[type=file]").on('change', function(ev) { pdfFile = ev.target.files; });
  $("#extractText button").on('click', extractText);
  $("#inputText button").on('click', processText);
  $("#processedText").on('mouseup', function(ev) { neEdit(window.getSelection().getRangeAt(0)); });
  $("#redactPdf button").on('click', redactPdf);
  
  // map multiple class names used by the different NERs to one label and class name (the first in the list) used in the UI
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
      { id: 'neEditUnchanged', value: 'unchanged', label: 'of current type' },
      { id: 'neEditChanged', value: 'changed', label: 'changed to type selected above' },
      { id: 'neEditDelete', value: 'deleted', label: 'deleted' }
    ],
    'neEdit',
    0));
  
  updateTree = mkTree;
});
