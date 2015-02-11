var qm = {};

// Find bookmark that matches regex, and execute callback
qm.searchKey = function (regex, maxsize, callback) {
  function search(bookmarkTreeNodes) {
    var results = [];
    var visit = function (tree) {
      var i = 0;
      for (i = 0; i < tree.length && results.length < maxsize; i++) {
        node = tree[i];
        if (node.children && node.children.length > 0) {
          visit(node.children);
        } else {
          var match = regex.exec(node.title);
          if (match != null) {
            results.push(node);
          }
        }
      }
    };
    visit(bookmarkTreeNodes);
    if (results && results.length > 0) {
      console.log('Results found, regex, results', regex, results);
    } else {
      console.log('No result found for regex', regex);
    }
    // Even no result found, still execute the callback with empty array
    callback(results);
  };
  chrome.bookmarks.getTree(search);
};

// Find bookmark base on regex and text. 
// Try regex first, if returned results is less than maxsize, search bookmark.
qm.searchBookmark = function (regex, text, maxsize, callback) {
  qm.searchKey(regex, maxsize, function (results){
    if (results.length < maxsize) {
      chrome.bookmarks.search(text, function (matched) {
        var i;
        for (i = 0; i < matched.length && results.length < maxsize; i++) {
          var index = results.indexOf(matched[i]);
          if (index < 0) {
            results.push(matched[i]);
          }
        }
        callback(results);
      });
    } else {
      callback(results);
    }
  });
};

qm.openUrl = function (url) {
  chrome.tabs.getSelected(null, function (tab) {
    if (tab == null) {
      return chrome.tabs.create({url: url});
    }

    if (tab.url != "chrome://newtab/") {

      // Remove the tab then duplicate it so focus is blurred from
      // the omnibox.
      //
      // We duplicate the tab instead of creating a new one because
      // this will preserve the tab's history.
      chrome.tabs.remove(tab.id, function() {
        chrome.tabs.duplicate(tab.id, function(duplicatedTab) {
          chrome.tabs.update(duplicatedTab.id, {url: url, selected: true});
        });
      });
    } else {
      chrome.tabs.remove(tab.id);
      chrome.tabs.create({url: url});
    }
  });
};

qm.toSuggestions = function (bookmarks) {
  return bookmarks.map(function (bookmark){
    return {
      content: bookmark.url,
         description: 'Open ' + qm.describe(bookmark)
    };
  });
};

qm.isUrl = function (text) {
  return text.indexOf('http') === 0;
};

qm.isScript = function (text) {
  return text.indexOf('javascript:') === 0;
};

qm.describe = function (bookmark) {
  var title = bookmark.title;
  var url = bookmark.url;
  if (qm.isUrl(url)) {
    return 'bookmark ' + title;
    // return 'bookmark ' + title + ', url: ' + url; 
  } else if (qm.isScript(url)) {
    return 'bookmarklet ' + title;
  } else {
    return title;
  };
};

/*
 * Omnibox behaviour starts here
 */
chrome.omnibox.setDefaultSuggestion({
  description: 'Enter bookmark keyword or search bookmark to start'
});

chrome.omnibox.onInputChanged.addListener(function (text, suggest) {
  if (!text) {
    return;
  }
  // Show match all keywords start with text
  var pattern = '.*\\[' + text + '.*\\]$';
  var regex = new RegExp(pattern);
  qm.searchBookmark(regex, text, 5, function (results){
    var suggestions = qm.toSuggestions(results);
    suggest(suggestions);
  });
});


chrome.omnibox.onInputEntered.addListener(function (text) {
  if (!text) {
    return;
  }

  if (qm.isUrl(text) || qm.isScript(text)) {
    console.log('URL or javascript detected, open directly', text);
    qm.openUrl(text);
  }
  var pattern = '.*\\[' + text + '\\]$';
  var regex = new RegExp(pattern);

  qm.searchBookmark(regex, text, 1, function (results) {
    if (results.length > 0) {
      console.log('Match found for entred text, results', text, results);
      var content = results[0].url;
      if (qm.isUrl(content)) {
        console.log('URL detected, open url');
        qm.openUrl(content);
      }
      else if (qm.isScript(content)) {
        // fix window.open that returns undefined
        var windowFix = "if(!window.open_){ window.open_ = window.open; window.open = function(url, name, props) { var r =window.open_(url, name, props);return r ? r : true; }; }; ";
        var js = content.match(/^javascript:\s*(.*)$/)[1];
        js = windowFix + js;
        console.log('Script detected, execute: ', js);
        chrome.tabs.executeScript(null, {code: js});
      }
      else {
        console.log('Canont determine how to handle content', content);
      }
    } 
  });
});
