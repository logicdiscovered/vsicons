// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { VsiconsPanel } from './IconsProvider';
import { SidebarProvider } from './sidebarProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	const sidebarProvider = new SidebarProvider(context.extensionUri);
	context.subscriptions.push(
	  vscode.window.registerWebviewViewProvider(
		"stanicon-sidebar",
		sidebarProvider
	  )
	);
	context.subscriptions.push(vscode.commands.registerCommand('vsicons.vsicons', (data ="") => {
		if(data !== ""){

			// traverseDirectory(data, function(err:any, result:any) {
			// 	if (err) {
			// 	  console.log(err);
			// 	  return;
			// 	}else{
			// 		console.log(result);
				 VsiconsPanel._view?.webview.postMessage({ type:"all",value:data });
			// 	}
				
				
			//   });
			VsiconsPanel.createOrShow(context.extensionUri);
		}else{
			
		    VsiconsPanel._view?.webview.postMessage({type:"all"});
			VsiconsPanel.createOrShow(context.extensionUri);
		}
		
	})
	);
	
}

// this method is called when your extension is deactivated
export function deactivate() {}
