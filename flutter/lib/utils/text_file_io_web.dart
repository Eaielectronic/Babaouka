import 'dart:async';
import 'dart:html' as html;

/// Opens the browser file chooser and returns the text of the chosen file.
/// Must be called straight from a tap handler so the browser allows the dialog.
Future<String?> pickTextFile() {
  final completer = Completer<String?>();
  final input = html.FileUploadInputElement()
    ..accept = '.txt,.json,.conf,text/plain,application/json'
    ..style.display = 'none';
  html.document.body?.append(input);

  void finish(String? text) {
    input.remove();
    if (!completer.isCompleted) completer.complete(text);
  }

  input.onChange.first.then((_) {
    final file = input.files?.first;
    if (file == null) {
      finish(null);
      return;
    }
    final reader = html.FileReader();
    reader.onLoadEnd.first.then((_) => finish(reader.result as String?));
    reader.onError.first.then((_) => finish(null));
    reader.readAsText(file);
  });
  input.on['cancel'].first.then((_) => finish(null));
  input.click();
  return completer.future;
}

/// Downloads [content] as a text file through the browser.
Future<bool> saveTextFile(String fileName, String content) async {
  final blob = html.Blob([content], 'text/plain');
  final url = html.Url.createObjectUrlFromBlob(blob);
  final anchor = html.AnchorElement(href: url)
    ..download = fileName
    ..style.display = 'none';
  html.document.body?.append(anchor);
  anchor.click();
  anchor.remove();
  html.Url.revokeObjectUrl(url);
  return true;
}
