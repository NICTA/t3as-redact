/**
 * Logger
 */
function Logger() {};

Logger.prototype.debug = function() {
  // $('#debug').append('DEBUG: ' + s + '<br/>');
  console.log(arguments);
};

Logger.prototype.error = function(s, e) {
  // $('#error').append('ERROR: ' + s + ' ' + e + '<br/>');
  console.log(s, e.stack);
};

// handle unsuccessful ajax response
Logger.prototype.ajaxError = function(jqXHR, textStatus, errorThrown) {
  this.debug('ajaxError: jqXHR =', jqXHR, 'textStatus =', textStatus);
  this.error('ajaxError:', errorThrown);
};

var log = new Logger();

/**
 * Markup: insert markup into input string
 */
function Markup(input) {
  this.input = input;
  this.output = input; // marked up text
  this.offsets = []; // array of { inputIdx: orig index, offset: number of chars inserted at this point }
};

// insert text at input index pos
Markup.prototype.insert = function(pos, text) {
  var i = this.outputIdx(pos);
  this.output = this.output.substring(0, i) + text + this.output.substring(i);
  this.offsets.push({ inputIdx : pos, offset : text.length });
  // log.debug('Markup:insert:', 'output =', this.output, 'offsets =', this.offsets);
};

// map input index inputIdx to output index
Markup.prototype.outputIdx = function(inputIdx) {
  var sum = inputIdx;
  $.each(this.offsets, function(idx, x) {
    if (x.inputIdx <= inputIdx) sum += x.offset;
  });
  // log.debug('Markup:index:', 'inputIdx =', inputIdx, 'sum =', sum);
  return sum;
};

/**
 * PageOffsets: convert char offsets from start of first page (start, end) to page number and offsets from start of that page (page, start, end). 
 * @param pages array of strings, each is the text content of one page
 */
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
};

// input: str, end offsets into whole text (concatenated pages)
// output: {pageNum, str, end} 1 based page that input str falls on and str, end relative to this page
PageOffsets.prototype.getPageOffset = function(str, end) {
  var i = 0;
  while (i < this.offsets.length && this.offsets[i] <= str) { i++; };
  var off = this.offsets[i - 1];
  var r = {page: i, start: str - off, end: end - off};
  log.debug('PageOffsets.getPageOffset:', 'str', str, 'end', end, 'r', r);
  return r;
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

/**
 * Client: handle interaction with server
 */
function Client(baseUrl) {
  this.baseUrl = baseUrl;
};

Client.prototype.extractText = function(pdfFile, success, error) {
  try {
    var self = this;
    var formData = new FormData();
    formData.append('pdfFile', pdfFile);
    log.debug('Client.extractText: pdfFile =', pdfFile, 'formData =', formData);
    $.ajax({
      type : 'POST',
      url : self.baseUrl + '/extractText',
      data :  formData,
      contentType: false, // http://abandon.ie/notebook/simple-file-uploads-using-jquery-ajax, https://github.com/Abban/jQueryFileUpload/blob/master/script.js
      processData: false,
      dataType : 'json',
      cache: false,
      success : function(data, textStatus, jqXHR) {
        try {
          log.debug('Client.extractText success: data =', data, 'textStatus =', textStatus, 'jqXHR =', jqXHR);
          success(data.pages);
        } catch (e) {
          log.error('Client.extractText success: url = ' + url, e);
          error();
        };
      },
      error : function(jqXHR, textStatus, errorThrown) {
        log.ajaxError(jqXHR, textStatus, errorThrown);
        error();
      }
    });
  } catch (e) {
    log.error('Client.extractText:', e);
    error();
  };
};

Client.prototype.nictaNER = function(txt, success, error) {
  try {
    var self = this;
    
    $.ajax({
      type : 'POST',
      url : 'http://ner.t3as.org/nicta-ner-web/rest/v1.0/ner',
      contentType : 'application/x-www-form-urlencoded; charset=UTF-8',
      data : encodeURIComponent(txt),
      dataType : 'json',
      success : function(data, textStatus, jqXHR) {
        try {
          log.debug('Client.nictaNER success:', 'data =', data, 'textStatus =', textStatus, 'jqXHR =', jqXHR);
          success(self.transformNictaNER(data, txt));
        } catch (e) {
          log.error('Client.nictaNER success:', e);
          error();
        };
      },
      error : function(jqXHR, textStatus, errorThrown) {
        log.ajaxError(jqXHR, textStatus, errorThrown);
        error();
      }
    });
  } catch (e) {
    log.error('Client.nictaNER:', e);
    error();
  };
};

/**
 * Transform response from NICTA NER into same format as CoreNLP/OpenNLP services
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
Client.prototype.transformNictaNER = function (data, txt) {
  var ners = $.map(data.phrases, function(sentence, sIdx) {
    return $.map(sentence, function(x, xIdx) { 
      var str = x.phrase[0].startIndex;
      var last = x.phrase[x.phrase.length - 1];
      var end = last.startIndex + last.text.length;
      // log.debug('Client.transformNictaNER:', 'x =', x, 'str =', str, 'end =', end, 'last =', last);
      return {
        representative : { start : str, end : end, text : txt.substring(str, end) },
        ner : x.phraseType.entityClass,
        coRefs : []
      };
    });
  });
  return { namedEntities: ners };
};

Client.prototype.ajaxPostJSON = function(url, params, success, error) {
  try {
    $.ajax({
      type : 'POST',
      url: url,
      contentType : 'application/json; charset=UTF-8',
      data: JSON.stringify(params),
      dataType: 'json',
      success: function(data, textStatus, jqXHR) {
        try {
          log.debug('Client.ajaxPostJSON success:', 'url', url, 'params', params, 'data', data, 'textStatus', textStatus, 'jqXHR', jqXHR);
          success(data);
        } catch (e) {
          log.error('Client.ajaxPostJSON success: url = ' + url, e);
          error();
        };
      },
      error: function(jqXHR, textStatus, errorThrown) {
        log.ajaxError(jqXHR, textStatus, errorThrown);
        error();
      }
    });
  } catch (e) {
    log.error('Client.ajaxPostJSON: url = ' + url, e);
    error();
  };
};

Client.prototype.openNlpNER = function(txt, success, error) {
  this.ajaxPostJSON(this.baseUrl + '/opennlp/json', {text: txt, withCoref: false}, success, error) 
}

Client.prototype.coreNlpNER = function(txt, success, error) {
  this.ajaxPostJSON(this.baseUrl + '/corenlp/json', {text: txt, withCoref: false}, success, error) 
}

Client.prototype.coreNlpNERWithCoref = function(txt, success, error) {
  this.ajaxPostJSON(this.baseUrl + '/corenlp/json', {text: txt, withCoref: true}, success, error) 
}

/**
 * Controller: 
 */
function Controller() {
  var self = this;
  this.client = new Client(
    window.location.protocol === 'file:'
    ? 'http://203.143.165.82:8080/redact/rest/v1.0' // use this when page served from a local file during dev
    : 'rest/v1.0'                                   // use relative path when page served from webapp
  );

  $('#file-upload-form').attr('action', this.client.baseUrl + '/echo');
  
  // Respond to file selection from user
  $('input#file-upload').on('change', function(ev) {
    // log.debug('init: ev.target.files =', ev.target.files);
    self.openFile(ev.target.files[0]); 
  });

  // Wire up temporary drag-drop indicator.
  // TODO: Update when document drag-drop functionality is implemented
  var img = $('div#start-drag-drop img');
  img.mouseover(function() { img.attr('src', 'images/start_hover.png') });
  img.mouseout(function() { img.attr('src', 'images/start.png') });

  // Add sample entities
  this.addEntityToList('people-entities', 2, 'Julie Brown', 'Reason');
  this.addEntityToList('people-entities', 3, 'Peter Smith', 'Reason');
  this.addEntityToList('organisation-entities', 1, 'Department of Mollis', 'Reason');
  this.addEntityToList('location-entities', 5, 'Canberra', 'Reason');
  this.addEntityToList('location-entities', 2, 'Sydney', 'Reason');
  this.addEntityToList('date-entities', 1, '1 Jan 2014', 'Reason');
  this.addEntityToList('number-entities', 2, '42', 'Reason');  
};

Controller.prototype.showView = function(view) {
  // Hide all views
  $('div.tr-view').hide();

  // Display the selected view
  $('div#' + view).show();  
};

Controller.prototype.showOpenFileDialog = function() {
  $('input#file-upload').trigger('click');
};

Controller.prototype.openFile = function(pdfFile) {
  var self = this;
  
  // Close currently open file
  this.closeFile();

  $('form#file-upload-form').submit(); // load orig PDF into iframe

  // Select the 'Original' view tab and display the tabs
  $('label#btn-view-original').button('toggle');
  $('div#view-nav').fadeIn();

  // Enable the close command on the file menu
  $('li#cmd-close-doc').removeClass('disabled');
  
  // Set the document name
  $('div#filename').text(pdfFile.name)

  // Show the original PDF view
  this.showView('view-original');

  // finally extract then process text
  
  function success(pages) {
    self.processText(pages);    
  };
  
  function error() {};
  
  this.client.extractText(pdfFile, success, error);
};

Controller.prototype.closeFile = function() {
  // Hide the view naigation tabs
  $('div#view-nav').fadeOut();

  // Disable the close command on the file menu
  $('li#cmd-close-doc').addClass('disabled');

  // Reset the title
  $('div#filename').text('Text redaction')

  // Return to the start (drag-drop) view
  this.showView('view-start');
};

Controller.prototype.processText = function(pages) {
  var self = this;
  
  this.pageOffsets = new PageOffsets(pages);
  var txt = pages.join(this.pageOffsets.pageSeparator);

  function success(data) {
    self.namedEntities = self.postProcess(data.namedEntities); // TODO: do we want to make this conditional on 'Settings'
    
    var elem = $('#view-redactions-doc');
    elem.empty();
    elem.append(self.markup(self.namedEntities, txt));

//    var treeData = toTreeData(namedEntities);
//    debug('genContent:', 'namedEntities', namedEntities, 'treeData =', treeData);
//    updateTree = updateTree(treeData, {highlight: highlight, unhighlight: unhighlight, move: move}); // create/update tree, return function to update existing tree
//    
//    $.each(tableConfig, function(idx, p) {
//      genNeTable(p.parent, p.classes, p.label, namedEntities);
//    });
//    
//    var elem = $('#entities');
//    $("input[type='text']", elem).attr('class', 'hidden'); // reason hidden until checkbox ticked
//    $("input[type='checkbox']", elem).on('change', redact);
//
//    // mouse over highlights the entity in Processed Text
//    $("span[neIdx]", elem)
//      .on("mouseenter", function(ev) { highlight(getNeIdx(getTarget(ev))); })
//      .on("mouseleave", function(ev) { unhighlight(getNeIdx(getTarget(ev))); });
  };
  
  function error() {};
  
  // TODO: use 'settings' switch ($('#inputText input[name=nerImpl]:checked').attr('id')) {
  switch ('nerImplNicta') {
  case 'nerImplCoreNlpWithCoref':
    this.client.coreNlpNERWithCoref(txt, success, error);
    break;
  case 'nerImplCoreNlp':
    this.client.coreNlpNER(txt, success, error);
    break;
  case 'nerImplOpenNlp':
    this.client.openNlpNER(txt, success, error);
    break;
  case 'nerImplNicta':
  default:
    this.client.nictaNER(txt, success, error);
    break;
  };
};

//markup named entities in text 
Controller.prototype.markup = function(namedEntities, text) {
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
  // log.debug('markup: sorted mentions d =', d);

  var m = new Markup(text);
  $.each(d, function(idx, x) {
    var t = '<span class="' + x.ner.toLowerCase() + '" neIdx="' + x.neIdx + '"' + (typeof x.coRefIdx === 'undefined' ? '' : ' coRefIdx="' + x.coRefIdx + '"') + '>';
    // log.debug('markup: t =', t, 'text', text.slice(x.start, x.end), 'x', x);
    m.insert(x.start, t);
    m.insert(x.end, '</span>');
  });
  // log.debug('markup: output', m.output);
  return m.output;
};

/**
 * @param acro the purported acronym
 * @param term the term
 * @returns {Boolean} true if acro is the acronym of term
 */
Controller.prototype.isAcronym = function(acro, term) {
  var arr = term.split(/ +/);
  var ac = '';
  for (i  = 0; i < arr.length; ++i) {
    ac += arr[i].charAt(0).toUpperCase();
  };
  log.debug('isAcronym: ', 'acro', acro, 'term', term, 'ac', ac);
  return ac === acro;
};

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
Controller.prototype.postProcess = function(namedEntities) {
  log.debug('Controller.postProcess:', 'namedEntities =', namedEntities);
  var self = this;
  
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
          if (v.ne.ner === 'ORGANIZATION' && (v.words.containsWords(ne.representative.text) || self.isAcronym(ne.representative.text, v.ne.representative.text))) return p;
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
  log.debug('Controller.postProcess:', 'return =', r);
  return r;
};

Controller.prototype.addEntityToList = function(listId, entityCount, entityName, reason) {
  var tr = "<tr>" +
    '<th></th>' +
    '<td><input type="checkbox" checked="checked" /></td>' +
    '<td class="entity-info">' +
      '<span class="badge pull-right">' + entityCount + '</span>' +
      '<div class="entity-name">' + entityName + '</div>' +
      '<div class="redaction-reason">' + reason + '</div>' +
    '</td>' +
  '</tr>';

  $('table#' + listId).append(tr);
}



