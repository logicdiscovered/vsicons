import * as fs from 'fs';
import * as path from 'path';


export function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function getfilearrys(pathtoicon: string): void {
	const filearray: any[] = [];
	const fullpath = pathtoicon.replace("\\vscode-resource\\file\\\\\\", "");
	fs.readdir(fullpath, function (err, files) {
		//handling error
		if (err) {
			return console.log('Unable to scan directory: ' + err);
		}
		console.info(files);
		//listing all files using forEach
		files.forEach(function (file) {
			filearray.push(file);
			// Do whatever you want to do with the file

		});

	});
	console.log(filearray);
}
export function traverseDirectory(dirnamepath: string, callback: any) {
	// const filearray:any[] = [];
	let dirname = dirnamepath.replace("\\vscode-resource\\file\\\\\\", "");
	var directory: any = [];
	fs.readdir(dirname, function (err, list) {
		dirname = fs.realpathSync(dirname);
		if (err) {
			return callback(err);
		}
		var listlength = list.length;
		list.forEach(function (file) {
			file = dirname + '\\' + file;
			fs.stat(file, function (err, stat) {
				const fileproperities = {
					name: gefilename(file),
					content: getcontent(file)
				}; 
				
				directory.push(fileproperities);
				if (stat && stat.isDirectory()) {
					traverseDirectory(file, function (err: any, parsed: any) {
						directory = directory.concat(parsed);
						if (!--listlength) {
							callback(null, directory);
						}
					});
				} else {
					if (!--listlength) {
						callback(null, directory);
					}
				}
			});
		});
	});
}

function gefilename(path:string){
    const temp = path.split("\\").pop();
	return temp?.toString().split(".")[0];

}
 function getcontent(path:string){
	const content = fs.readFileSync(path,{ encoding: 'utf8' });
	return content;
}
