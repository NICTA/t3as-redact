/**
 * TODO: use namespaces: $.myNamespace = { .. };
 * http://stackoverflow.com/questions/527089/is-it-possible-to-create-a-namespace-in-jquery
 */

// debug and error logging

function debug() {
  // $('#debug').append('DEBUG: ' + s + '<br/>');
  console.log(arguments)
};

function error(s, e) {
  console.log(s, e.stack);
  // $('#error').append('ERROR: ' + s + ' ' + e + '<br/>');
};

// handle unsuccessful ajax response
function ajaxError(jqXHR, textStatus, errorThrown) {
  error('jqXHR = ' + jqXHR + ', textStatus = ' + textStatus, errorThrown);
};

// add an .onEnter function we can use for input fields
//(function($) {
//  $.fn.onEnter = function(func) {
//    this.bind('keypress', function(e) {
//      if (e.keyCode == 13) func.apply(this, [ e ]);
//    });
//    return this;
//  };
//})(jQuery);

function addSpinner(elem) {
  // $('div.spinner', elem).remove(); // incase previous ajax request did not return and spinner is still there
  elem.append('<div class="spinner"><img src="ajax-loader.gif" alt="spinner"></div>');
};

/**
 * Do an AJAX GET request.
 * 
 * @param url to get
 * @param params query params (null for none) 
 * @param elem parent of generated content
 * @param genContent function to generate the content from the AJAX response
 */
//function ajaxGet(url, params, elem, genContent) {
//  try {
//    elem.empty();
//    addSpinner(elem);
//    $.ajax({
//      url: url,
//      data: params,
//      dataType: 'json',
//      success: function(data, textStatus, jqXHR) {
//        try {
//          debug('ajaxGet:', 'url', url, 'params', params, 'data', data, 'textStatus', textStatus, 'jqXHR', jqXHR);
//          elem.empty();
//          genContent(elem, data);
//        } catch (e) {
//          error('ajaxGet.success: url = ' + url, e);
//        }
//      },
//      error: ajaxError
//    });
//  } catch (e) {
//    error('ajaxGet: url = ' + url, e);
//  }
//};

function ajaxPost(url, params, elem, genContent) {
  try {
    elem.empty();
    addSpinner(elem);
    $.ajax({
      type : 'POST',
      url: url,
      contentType : 'application/json; charset=UTF-8',
      data: JSON.stringify(params),
      dataType: 'json',
      success: function(data, textStatus, jqXHR) {
        try {
          debug('ajaxPost:', 'url', url, 'params', params, 'data', data, 'textStatus', textStatus, 'jqXHR', jqXHR);
          elem.empty();
          genContent(elem, data);
        } catch (e) {
          error('ajaxPost.success: url = ' + url, e);
        }
      },
      error: ajaxError
    });
  } catch (e) {
    error('ajaxPost: url = ' + url, e);
  }
};

/**
 * @param d array of (id, value, label)
 * @param name common name for all the radio buttons
 * @param checkedIdx index (into d) of item to be initially checked
 * @return array of radio buttons and labels.
 */
function mkRadios(d, name, checkedIdx) {
  return $.map(d, function(x, idx) {
    return [
      $('<input>').attr({type: 'radio', name: name, id: x.id, value: x.value, checked: idx == checkedIdx ? "checked" : null}),
      $('<label>').attr({for: x.id}).text(x.label)
      ];
  });
};

/**
 * @param el jQuery object representing an element or set of siblings
 * @returns array of raw Text nodes in doc order
 */
function getTextDescendantsInDocOrder(el) {
  return $.map(el, function(c, idx) {
    return c.nodeType == 3 ? c
        : c.nodeType == 1 ? getTextDescendantsInDocOrder($(c).contents())
        : [];
  }); 
};

