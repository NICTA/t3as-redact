
function init()
{
  // Respond to file selection from user
  $('input#file-upload').on('change', function(ev) { openFile(ev.target.files[0]); });

  // Wire up temporary drag-drop indicator.
  // TODO: Update when document drag-drop functionality is implemented
  var img = $('div#start-drag-drop img');
  img.mouseover(function() { img.attr('src', 'images/start_hover.png') });
  img.mouseout(function() { img.attr('src', 'images/start.png') });

  // Add sample entities
  addEntityToList('people-entities', 2, 'Julie Brown', 'Reason');
  addEntityToList('people-entities', 3, 'Peter Smith', 'Reason');
  addEntityToList('organisation-entities', 1, 'Department of Mollis', 'Reason');
  addEntityToList('location-entities', 5, 'Canberra', 'Reason');
  addEntityToList('location-entities', 2, 'Sydney', 'Reason');
  addEntityToList('date-entities', 1, '1 Jan 2014', 'Reason');
  addEntityToList('number-entities', 2, '42', 'Reason');
}

function showView(view)
{
  // Hide all views
  $('div.layout-view').hide();

  // Display the selected view
  $('div#' + view).show();  
}

function showOpenFileDialog()
{
  $('input#file-upload').trigger('click');
}

function openFile(pdfFile)
{
  // Close currently open file
  closeFile();

  // TODO: Implement upload process
  /*
  var formData = new FormData();
  formData.append('pdfFile', pdfFile);
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
  */

  // Select the 'Original' view tab and display the tabs
  $('label#btn-view-original').button('toggle');
  $('div#view-nav').fadeIn();

  // Enable the close command on the file menu
  $('li#cmd-close-doc').removeClass('disabled');
  
  // Set the document name
  $('div#filename').text(pdfFile.name)

  // TODO: Set display filename for the redacted version (probably at a later stage)
  $('span#redacted-filename').text(pdfFile.name.split('.')[0] + '_redacted.pdf')

  // Show the original PDF view
  showView('view-original');
}

function closeFile()
{
  // Clear selected file in the file upload input
  $('input#file-upload').val('');

  // Hide the view naigation tabs
  $('div#view-nav').fadeOut();

  // Disable the close command on the file menu
  $('li#cmd-close-doc').addClass('disabled');

  // Reset the title
  $('div#filename').text('Text redaction')

  // Return to the start (drag-drop) view
  showView('view-start');
}

function addEntityToList(listId, entityCount, entityName, reason)
{
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



