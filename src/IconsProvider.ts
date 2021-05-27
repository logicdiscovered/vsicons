import * as vscode from "vscode";
import { getNonce } from "./Main";
import * as fs from "fs";
import * as path from 'path';
export class VsiconsPanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: VsiconsPanel | undefined;

  public static readonly viewType = "vsicons";

  public readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  public static _view?: vscode.WebviewPanel;

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (VsiconsPanel.currentPanel) {
      VsiconsPanel.currentPanel._panel.reveal(column);
      VsiconsPanel.currentPanel._update();
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      VsiconsPanel.viewType,
      "VsIcon",
      column || vscode.ViewColumn.One,
      {
        // Enable javascript in the webview
        enableScripts: true,

        // And restrict the webview to only loading content from our extension's `media` directory.
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "media"),
          vscode.Uri.joinPath(extensionUri, "out/compiled"),
        ],
      }
    );

    VsiconsPanel.currentPanel = new VsiconsPanel(panel, extensionUri);
  }

  public static kill() {
    VsiconsPanel.currentPanel?.dispose();
    VsiconsPanel.currentPanel = undefined;
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    VsiconsPanel.currentPanel = new VsiconsPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    VsiconsPanel._view = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

  }


  public dispose() {
    VsiconsPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private async _update() {
    const webview = this._panel.webview;

    this._panel.webview.html = this._getHtmlForWebview(webview);
    webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "onInfo": {
          if (!data.value) {
            return;
          }
          vscode.window.showInformationMessage(data.value);
          break;
        }
        case "data": {
          if (!data.value) {
            return;
          }
          vscode.window.showInformationMessage(data.value);
          break;
        }
        case "copied": {
          if (!data.value) {
            vscode.window.showErrorMessage("nothing to copy");
            return;
          }
          vscode.env.clipboard.writeText(data.value);
          vscode.window.showInformationMessage("copied");
          break;
        }
        case "insert": {
          if (!data.value) {
            return;
          }

          if (vscode && vscode.workspace && vscode.workspace.workspaceFolders) {
            const folderpath = vscode.workspace.workspaceFolders[0].uri.path.split(":")[1].toString();
            const fullpath = folderpath + "\\vsicons\\icons";
            fs.mkdir(fullpath, { recursive: true }, (err) => {
              if (err) { console.log(`Error creating directory: ${err}`); }
              // Directory now exists.
            });

            fs.writeFile(path.join(fullpath, data.name + ".svg"), data.value, error => {

              if (error) {
                vscode.window.showErrorMessage("error in creating file" + error);
              } else {
                vscode.window.showInformationMessage("svg successfull created");
              }

            });

          } else {
            vscode.window.showErrorMessage("no workspace provides");
          }
          break;
        }
        case "onError": {
          if (!data.value) {
            return;
          }
          vscode.window.showErrorMessage(data.value);
          break;
        }
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // // And the uri we use to load this script in the webview
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "out/compiled", "Vsicons.js")
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "out/compiled", "Vsicons.css")
    );

    // // Uri to load styles into webview
    const stylesResetUri = webview.asWebviewUri(vscode.Uri.joinPath(
      this._extensionUri,
      "media",
      "reset.css"
    ));
    const stylesvsUri = webview.asWebviewUri(vscode.Uri.joinPath(
      this._extensionUri,
      "media",
      "vscode.css"
    ));
    // const cssUri = webview.asWebviewUri(
    //   vscode.Uri.joinPath(this._extensionUri, "out", "compiled/swiper.css")
    // );

    // Use a nonce to only allow specific scripts to be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
        -->
        <meta http-equiv="Content-Security-Policy" content=" img-src https: data:; style-src 'unsafe-inline' ${webview.cspSource
      }; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${stylesResetUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">
				<link href="${stylesvsUri}" rel="stylesheet">
        <link href="" rel="stylesheet">
        <script nonce="${nonce}">
        const tsiconvscode = acquireVsCodeApi();
        </script>
			</head>
      <body>
			</body>
      <script src="${scriptUri}" nonce="${nonce}">
			</html>`;
  }
}