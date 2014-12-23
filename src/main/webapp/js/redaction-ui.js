function showView(view)
{
  // Hide all views
  $('div.tr-view').hide();

  // Display the selected view
  $('div#' + view).show();  
}

function openDoc()
{
  closeDoc();
  
  // Select the 'Original' view tab and display the tabs
  $('label#btn-view-original').button('toggle');
  $('div#view-nav').fadeIn();

  // Enable the close command on the file menu
  $('li#cmd-close-doc').removeClass('disabled');
  
  // Set the document name
  // TODO: Set this to the real document name when implemented
  $('div#filename').text('document.pdf')

  // Show the original PDF view
  showView('view-original');
}

function closeDoc()
{
  // Hide the view naigation tabs
  $('div#view-nav').fadeOut();

  // Disable the close command on the file menu
  $('li#cmd-close-doc').addClass('disabled');

  // Reset the title
  $('div#filename').text('Text redaction')

  // Return to the start (drag-drop) view
  showView('view-start');
}

function init()
{
  // Wire up temporary drag-drop indicator.
  // TODO: Update when document drag-drop functionality is implemented
  var img = $('div#start-drag-drop img');
  img.mouseover(function() { img.attr('src', './images/start_hover.png') });
  img.mouseout(function() { img.attr('src', './images/start.png') });
}
