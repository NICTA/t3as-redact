/**
 * Logger
 */
var log = {
  debug: function() {
    // $('#debug').append('DEBUG: ' + s + '<br/>');
    console.log(arguments);
  },
  
  error: function(s, e) {
    // $('#error').append('ERROR: ' + s + ' ' + e + '<br/>');
    console.log(s, e.stack);
  },
  
  ajaxError: function(jqXHR, textStatus, errorThrown) {
    this.debug('ajaxError: jqXHR =', jqXHR, 'textStatus =', textStatus);
    this.error('ajaxError:', errorThrown);
  }
};

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
 * A reference to a span in the text, that is one of:
 * a) a representative mention of a named entity NeRef(neIdx, -1);
 * b) a secondary mention or coRef of a named entity NeRef(neIdx, corefIdx);
 * c) nothing/invalid NeRef(-1, -1).
 */
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

var util = {
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
  transformNictaNER: function (data, txt) {
    var ners = $.map(data.phrases, function(sentence, sIdx) {
      return $.map(sentence, function(x, xIdx) { 
        var str = x.phrase[0].startIndex;
        var last = x.phrase[x.phrase.length - 1];
        var end = last.startIndex + last.text.length;
        // log.debug('util.transformNictaNER:', 'x =', x, 'str =', str, 'end =', end, 'last =', last);
        return {
          representative : { start : str, end : end, text : txt.substring(str, end) },
          ner : x.phraseType.entityClass,
          coRefs : []
        };
      });
    });
    return { namedEntities: ners };
  },
  
  /**
   * @param acro the purported acronym
   * @param term the term
   * @returns {Boolean} true if acro is the acronym of term
   */
  isAcronym: function(acro, term) {
    var arr = term.split(/ +/);
    var ac = '';
    for (i  = 0; i < arr.length; ++i) {
      ac += arr[i].charAt(0).toUpperCase();
    };
    log.debug('util.isAcronym: ', 'acro', acro, 'term', term, 'ac', ac);
    return ac === acro;
  },
 
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
   * Bug: with Leif's PDF text + CoreNLP with coRef
   * First result ne has: start = 64, end = 76 and coref[1] is the same!
   * Oh, it's not my bug, that is in the data produced by CoreNLP. Looks like we have to filter that!
   */
  postProcess: function(namedEntities) {
    log.debug('util.postProcess:', 'namedEntities =', namedEntities);
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
            if (v.ne.ner === 'ORGANIZATION' && (v.words.containsWords(ne.representative.text) || util.isAcronym(ne.representative.text, v.ne.representative.text))) return p;
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
    log.debug('util.postProcess:', 'return =', r);
    return r;
  },
  
  /**
   * @param el jQuery object representing an element or set of siblings
   * @returns array of raw Text nodes in doc order
   */
  getTextDescendantsInDocOrder: function(el) {
    var self = this;
    return $.map(el, function(c, idx) {
      return c.nodeType == 3 ? c
          : c.nodeType == 1 ? self.getTextDescendantsInDocOrder($(c).contents())
          : [];
    }); 
  },
  
  /**
   * Get text offset relative to elem.
   * @param offset relative to container
   * @param container a text node
   * @param elem ancestor of container
   * @return offset + sum of lengths of all text nodes under elem which preceed containiner 
   */
  getTextOffset: function(offset, container, elem) {
    var txts = this.getTextDescendantsInDocOrder(elem);
    var find = txts.indexOf(container);
    var sum = offset;
    for (i = 0; i < find; ++i) sum += txts[i].length;
    return sum;
  },
  
  /**
   * Find the first representative or coref mention that covers the given offset.
   * TODO: with post processing there will only be one, but without there may be multiple overlapping mentions, so maybe we should return all of them.
   * @param data namedEntities
   * @param offset
   * @returns { neIdx: neIdx, corefIdx: corefIdx } with -1 for not found
   */
  findNeRef: function(namedEntities, offset) {
    function inM(m) { return m.start <= offset && offset <= m.end; };
    for (neIdx = 0; neIdx < namedEntities.length; ++neIdx) {
      var ne = namedEntities[neIdx];
      if (inM(ne.representative)) return new NeRef(neIdx, -1); // -1 for corefIdx because its found in representative mention
      for (corefIdx = 0; corefIdx < ne.coRefs.length; ++corefIdx) {
        if (inM(ne.coRefs[corefIdx])) return new NeRef(neIdx, corefIdx);
      };
    };
    return new NeRef(-1, -1);
  }

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
          success(util.transformNictaNER(data, txt));
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
 * Controller (and View): initialization
 */
function Controller() {
  this.model = {};
  var self = this;
  
  // map multiple named entity types used by the different NERs to one label and class name (the first in the list) used in the UI
  this.tableConfig = [
    { parent : $('#people'), classes : [ 'PERSON' ], label : 'Person' },
    { parent : $('#organizations'), classes : [ 'ORGANIZATION', 'UNKNOWN' ], label : 'Organization' },
    { parent : $('#locations'), classes : [ 'LOCATION' ], label : 'Location' },
    { parent : $('#dates'), classes : [ 'DATE', 'TIME' ], label : 'Date, time, duration' },
    { parent : $('#numbers'), classes : [ 'NUMBER', 'PERCENT', 'PERCENTAGE', 'MONEY' ], label : 'Number' }
  ];
  
  var genNeTypeItems = function() { // generate a <li> for each tableConfig item, ner is the named entity type
    return $.map(self.tableConfig, function(tc, idx) {
      return $('<li>').append($('<a>').attr({ 'class':  'entity-type ' + tc.classes[0].toLowerCase(), ner: tc.classes[0], tabindex: '-1' }).text(tc.label));
    });
  };
  
  var cr = $('#view-redactions-create-menu ul');
  cr.append(genNeTypeItems());
  $('a', cr).on('click', function(e) {
    var ner = $(e.target).attr('ner');
    self.createEntity(ner);
  });
  
  var ed = $('#view-redactions-edit-menu ul');
  ed.append(genNeTypeItems())
    .append($('<li>').addClass('divider'))
    .append($('<li>').append($('<a>').attr({ 'class': 'delete', action: 'delete', tabindex: '-1' }).text('Delete')));
  $('a', ed).on('click', function(e) {
    var ner = $(e.target).attr('ner');
    ner === 'delete' ? self.deleteEntity() : self.editEntity(ner);
  });

  this.client = new Client(
    window.location.protocol === 'file:'
    ? 'http://203.143.165.82:8080/redact/rest/v1.0' // use this when page served from a local file during dev
    : 'rest/v1.0'                                   // use relative path when page served from webapp
  );

  // Respond to file selection from user
  $('#file-upload-form input[type=file]').on('change', function(ev) {
    // log.debug('init: ev.target.files =', ev.target.files);
    self.openFile(ev.target.files[0]);
  });

  // Wire up temporary drag-drop indicator.
  // TODO: Update when document drag-drop functionality is implemented
  var img = $('#start-drag-drop img');
  img.mouseover(function() { img.attr('src', 'images/start_hover.png') });
  img.mouseout(function() { img.attr('src', 'images/start.png') });
  
  $("#view-redactions-doc").on('mouseup', function(e) {
    self.editNamedEntity(e, window.getSelection().getRangeAt(0));
    return false;
  });
};

Controller.prototype.addSpinner = function(parent) {
  $(parent).append($("<img>").attr({src: 'images/ajax_loader_gray_64.gif', alt: 'spinner'}));
};

Controller.prototype.clearSpinner = function(parent) {
  $(parent).empty();
};

Controller.prototype.showView = function(view) {
  // Hide all views
  $('div.layout-view').hide();

  // Display the selected view
  $('#' + view).show();
  
  if (view === 'view-export') this.redactPdf();
};

Controller.prototype.showOpenFileDialog = function() {
  $('#file-upload-form input[type=file]').trigger('click');
};

Controller.prototype.openFile = function(pdfFile) {
  var self = this;
  
  var spin = '#view-original .spinner';
  this.addSpinner(spin);
  $('#view-original iframe').attr( { onload: "controller.clearSpinner('" + spin + "')" } );
  $('#file-upload-form').attr( { action: this.client.baseUrl + '/echo', target: 'orig-pdf' } ).submit(); // load orig PDF into orig-pdf iframe

  // Select the 'Original' view tab and display the tabs
  $('#btn-view-original').button('toggle');
  $('#view-nav').fadeIn();

  // Enable the close command on the file menu
  $('#cmd-close-doc').removeClass('disabled');
  
  // Set the document name
  $('#filename').text(pdfFile.name)

  // TODO: Set display filename for the redacted version (probably at a later stage)
  $('#redacted-filename').text(pdfFile.name.split('.')[0] + '_redacted.pdf')

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
  this.model = {};
  
  // Clear hidden form fields
  $('#file-upload-form input').val('');

  // Hide the view naigation tabs
  $('#view-nav').fadeOut();

  // Disable the close command on the file menu
  $('#cmd-close-doc').addClass('disabled');

  // Reset the title
  $('#filename').text('Text redaction')

  // Return to the start (drag-drop) view
  this.showView('view-start');
};

Controller.prototype.processText = function(pages) {
  var self = this;
  
  this.model.pageOffsets = new PageOffsets(pages);
  this.model.text = pages.join(this.model.pageOffsets.pageSeparator);

  var spin = '#view-redactions .spinner';
  this.addSpinner(spin);
  
  function success(data) {
    self.clearSpinner(spin);
    self.updateUI(data.namedEntities);
  };
  
  function error() {
    self.clearSpinner(spin);
  };
  
  // TODO: use 'settings' switch ($('#inputText input[name=nerImpl]:checked').attr('id')) {
  switch ('nerImplOpenNlp') {
  case 'nerImplCoreNlpWithCoref':
    this.client.coreNlpNERWithCoref(this.model.text, success, error);
    break;
  case 'nerImplCoreNlp':
    this.client.coreNlpNER(this.model.text, success, error);
    break;
  case 'nerImplOpenNlp':
    this.client.openNlpNER(this.model.text, success, error);
    break;
  case 'nerImplNicta':
  default:
    this.client.nictaNER(this.model.text, success, error);
    break;
  };
};

Controller.prototype.updateUI = function(namedEntities) {
  this.model.namedEntities = util.postProcess(namedEntities); // TODO: do we want to make this conditional on 'Settings'
  this.populateProcessedText();
  this.populateEntities();  
};

Controller.prototype.populateEntities = function() {
  var self = this;
  
  var elem = $('#view-redactions-sidebar .generated-entities'); 
  elem.empty();
  elem.append($.map(this.tableConfig, function(tblCfg, tblCfgIdx) {
    return $('<div>').addClass(tblCfg.classes[0].toLowerCase())
      .append($('<div>').addClass('category').text(tblCfg.label).append($('<span>').addClass('badge pull-right')))
      .append($.map(self.model.namedEntities, function(ne, neIdx) {
        return tblCfg.classes.indexOf(ne.ner) === -1 ? undefined : $('<div>').attr( { 'class': 'entity-info', neIdx: neIdx } )
          .append($('<div>').addClass('redaction-checkbox').append($('<input>').attr( { type: 'checkbox', id: neIdx } )))
          .append($('<div>').addClass('entity-name').append($('<label>').attr('for', neIdx).text(ne.representative.text))) // TODO: do I need document.createTextNode(t) to properly escape the text?
          .append($('<span>').addClass('badge pull-right').text(ne.coRefs.length + 1))
          .append($('<div>').addClass('redaction-reason').append($('<input>').attr('type', 'text').val('reason')))
          .append($('<ul>').addClass('entity-corefs hidden').append($.map(ne.coRefs, function(coRef, coRefIdx) {
            return $('<li>').attr( { neIdx: neIdx, coRefIdx: coRefIdx } ).text(coRef.text);
          })));
      }));
  }));
  
  $('div.entity-info .badge', elem).click(function() {
    var badge = $(this);
    var count = badge.text();
    var neIdx = badge.closest('.entity-info').attr('neIdx');
    var ul = $('div[neIdx=' + neIdx + '].entity-info ul', elem);
    var hidden = ul.hasClass('hidden');
    $('div.entity-info ul', elem).addClass('hidden');
    if (hidden && count > 1) ul.removeClass('hidden');
  });
  
  $('div.entity-info .redaction-checkbox input', elem).click(function() {
    var cb = $(this);
    var neIdx = cb.closest('.entity-info').attr('neIdx');
    var spans = $('#view-redactions-doc span[neidx=' + neIdx + ']');
    if (cb.is(":checked")) spans.addClass('redacted');
    else spans.removeClass('redacted');
  });
};

Controller.prototype.populateProcessedText = function() {
  var elem = $('#view-redactions-doc');
  elem.empty();
  elem.append(this.markup());
};

/**
 * markup named entities in text
 */ 
Controller.prototype.markup = function() {
  // usage: ner2class[ne.ner] -> class name (the first in the list)
  ner2class = {};
  $.each(this.tableConfig, function(i, tc) {
    $.each(tc.classes, function(j, c) {
      ner2class[c] = tc.classes[0];
    });
  });
  
  var d = $.map(this.model.namedEntities, function(ne, neIdx) {
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
  // log.debug('util.markup: sorted mentions d =', d);

  var m = new Markup(this.model.text);
  $.each(d, function(idx, x) {
    var t = '<span class="' + ner2class[x.ner].toLowerCase() + '" neIdx="' + x.neIdx + '"' + (typeof x.coRefIdx === 'undefined' ? '' : ' coRefIdx="' + x.coRefIdx + '"') + '>';
    // log.debug('util.markup: t =', t, 'text', text.slice(x.start, x.end), 'x', x);
    m.insert(x.start, t);
    m.insert(x.end, '</span>');
  });
  // log.debug('util.markup: output', m.output);
  return m.output;
},

/**
 * Edit namedEntities according to user input.
 * @param range of text selected
 */
Controller.prototype.editNamedEntity = function(mouseEvent, range) {
  var self = this;
//  var createType = $('#neCreate input:checked').attr('value');
//  var editType = $('#neEdit input:checked').attr('value');
  log.debug('Controller.editNamedEntity: range =', range);
  if (range.endOffset > range.startOffset || range.startContainer !== range.endContainer) {
    var elem = $('#view-redactions-doc');
    var str = util.getTextOffset(range.startOffset, range.startContainer, elem);
    var strNeRef = util.findNeRef(this.model.namedEntities, str);
    var end = util.getTextOffset(range.endOffset, range.endContainer, elem);
    var endNeRef = util.findNeRef(this.model.namedEntities, end);

    // save for use by create/delete/editEntity
    this.model.neRef = strNeRef.combine(endNeRef);
    this.model.newEntity = {
        representative : { start: str, end: end, text: this.model.text.substring(str, end) },
        // ner : not yet known,
        coRefs : []
      };

    log.debug('Controller.editNamedEntity:', 'str', str, 'strNeRef', strNeRef, 'end', end, 'endNeRef', endNeRef, 'neRef', this.model.neRef, 'newEntity', this.model.newEntity);
    if (this.model.neRef.neIdx === -1) {      
      // When user double clicks (to select a word) we get a stream of events: mousedown, mouseup, click, mousedown, mouseup, click, dblclick.
      // This code is triggered on mouseup (and first `if` above means it's not the 1st mouseup when no text is selected).
      // If showCreateEntityMenu() is executed here, subsequent event processing by jQuery hides the menu again.
      // So we execute it asynchronously, letting jQuery do it's thing with events first.  
      setTimeout(function() { self.showEntityMenu(mouseEvent, '#view-redactions-create-menu'); }, 5);
    } else {
      // highlight current ner
      var ner = this.model.namedEntities[this.model.neRef.neIdx].ner;
      var elem = $('#view-redactions-edit-menu ul');
      $('a', elem).removeClass('current');
      $('a[ner=' + ner + ']', elem).addClass('current');
      
      setTimeout(function() { self.showEntityMenu(mouseEvent, '#view-redactions-edit-menu'); }, 5);
    };
//    namedEntities = conditionalPostProcess(namedEntities);
//    log.debug('Controller.editNamedEntity:', 'namedEntities', namedEntities);
//    var elem = clearResults();
//    genContent(elem, txt, namedEntities);
  };
};

Controller.prototype.showEntityMenu = function(mouseEvent, menu) {
  var doc = $('#view-redactions-doc'); 
  var cm = doc.data('context');
  if (cm) cm.destroy(); // remove current menu
  doc.contextmenu({
    target: menu // add new menu
  });
  cm = doc.data('context');
  cm.show(mouseEvent);
};

Controller.prototype.createEntity = function(ner) {
  var nes = this.model.namedEntities;
  var newNe = this.model.newEntity;
  log.debug('Controller.createEntity: ner =', ner, 'newNe =', newNe);
  newNe.ner = ner;
  nes.push(newNe);
  this.updateUI(nes);
};

Controller.prototype.deleteEntity = function() {
  var r = this.model.neRef;
  var nes = this.model.namedEntities;
  log.debug('Controller.deleteEntity: r =', r);  
  if (r.corefIdx === -1) nes.splice(r.neIdx, 1);
  else nes[r.neIdx].coRefs.splice(r.corefIdx, 1);
  this.updateUI(nes);
};

Controller.prototype.editEntity = function(ner) {
  var r = this.model.neRef;
  var nes = this.model.namedEntities;
  var ne = nes[r.neIdx];
  var newNe = this.model.newEntity;
  log.debug('Controller.editEntity: ner =', ner, 'r =', r, 'newNe =', newNe, r.corefIdx !== -1 && ne.ner !== ner ? "warning: not changing type of coref!" : "");
  if (r.corefIdx === -1) {
    ne.ner = ner;
    ne.representative = newNe.representative;
  } else {
    ne.coRefs[r.corefIdx] = newNe.representative;
  };
  this.updateUI(nes);
};

Controller.prototype.redactPdf = function() {
  var self = this;
  var elem = $("#view-redactions-sidebar");
  
  var redact = $.map($("input[type='checkbox']:checked", elem), function(cb, idx) {
    var info = $(cb).closest('.entity-info');
    var neIdx = info.attr('neIdx');
    var ne = self.model.namedEntities[neIdx]; // lookup namedEntity using each checkbox neIdx attr
    var reason = $('input[type=text]', info).val();
    log.debug('Controller.redactPdf: ne =', ne, 'reason =', reason);
    // flatten the representative ne and its coRefs
    return $.map([ ne.representative ].concat(ne.coRefs), function(a, idx) {
      var redactItem = self.model.pageOffsets.getPageOffset(a.start, a.end); // convert offsets into text from all pages to page and offset within page
      redactItem.reason = reason;
      return redactItem;
    });
  });
  log.debug('redactPdf: redact =', redact);
  
  var spin = '#view-export .spinner';
  this.addSpinner(spin);
  $('#view-export iframe').attr( { onload: "controller.clearSpinner('" + spin + "')" } );
  var f = $('#file-upload-form');
  $('input[name=redact]', f).val(JSON.stringify( { redact: redact } ));
  f.attr( { action: this.client.baseUrl + '/redact', target: 'export-pdf' } ).submit(); // load redacted PDF into export-pdf iframe
};

var controller;
$(function(){
  controller = new Controller();
});

