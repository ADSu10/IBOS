paper.install(window);
let svg = null;
let svgButton = null;
let test = false;
let divJ = null
$(document).ready( function() {

	let canvas = document.getElementById("paperCanvas")

	paper.setup(canvas);

	// objeto global para almacenar todos los parámetros: las dimensiones de Braille son estándares
	let braille = {
		marginWidth: 3,
		marginHeight: 5,
		paperWidth: 175,
		paperHeight: 290,
		letterWidth: 2.5,
		dotRadius: 1.2,
		letterPadding: 2.5,
		linePadding: 6,
		headDownPosition: -2.0,
		headUpPosition: 10,
		speed: 4000,
		delta: false,
		goToZero: false,
		invertX: false,
		invertY: false,
		mirrorX: false,
		mirrorY: false,
		svgStep: 2,
		svgDots: true,
		svgPosX: 0,
		svgPosY: 0,
		// svgScale: 1,
		language: "6 dots",
		GCODEup: 'M5 Z0.1 F4000',
		GCODEdown: 'M4 Z0 F4000'
	};

	let pixelMillimeterRatio = null;

	let text = '';
	let gcode = '';
	let sortedgcode = '';

	let xhead = 0;
	let yhead = 0;

	// Reemplazar un char en el índice en una cadena
	function replaceAt(s, n, t) {
	    return s.substring(0, n) + t + s.substring(n + 1);
	}

	function DotPosition (xpos, ypos) {
		this.x = xpos;
		this.y = ypos;
	}

	var GCODEdotposition = [];
	var GCODEsvgdotposition = [];

	let latinToBraille = new Map(); 		// obtener índices de puntos braille de char
	let dotMap = null;					// obtener el orden de los puntos a partir de las coordenadas x, y
	let numberPrefix = null; 			// los índices del prefijo numérico del idioma

	let gcodeSetAbsolutePositioning = function() {
		return 'G90;\r\n'
	}

	let gcodeMotorOff = function()
	{
		return 'M84;\r\n';
	}

	let gcodeHome = function ()
		{
			str = 'G28 X;\r\n';
			str += 'G28 Y;\r\n';

			return str;
		}

	let gcodeResetPosition = function(X, Y, Z) {
		return 'G92' + gcodePosition(X, Y, Z);
	}

	let gcodeSetSpeed = function(speed) {
		return 'G1 F' + speed + ';\r\n'
	}

	let gcodePosition = function(X, Y, Z) {
		let code = ''
		if(X == null && Y == null && Z == null) {
			throw new Error("Posición nula cuando se mueve")
		}
		if(X != null) {
			code += ' X' + X.toFixed(2)
		}
		if(Y != null) {
			code += ' Y' + Y.toFixed(2)
		}
		if(Z != null) {
			code += ' Z' + Z.toFixed(2)
		}
		code += ';\r\n'
		return code
	}

	let gcodeGoTo = function(X, Y, Z) {
		return 'G0' + gcodePosition(X, Y, Z)
	}

	let gcodeMoveTo = function(X, Y, Z) {
		return 'G1' + gcodePosition(X, Y, Z)
	}

	let gcodeMoveToCached = function (X,Y,Z)
		{
			if (X != null)
				xhead = X;
			if (Y != null)
				yhead = Y;

			return gcodeMoveTo (X,Y,Z);
		}


		let gcodeprintdot = function () {


			let s = braille.GCODEdown + ';\r\n';
			s += braille.GCODEup + ';\r\n';

			return (s);
		}

		let gcodePrintDotCached = function ()
		{
			if (xhead != null && yhead != null)
				GCODEdotposition.push (new DotPosition (xhead,yhead));

			return gcodeprintdot ();
		}

		let gcodeGraphDotCached = function ()
		{
			if (xhead != null && yhead != null)
				GCODEsvgdotposition.push (new DotPosition (xhead,yhead));

			return gcodeprintdot ();
		}

		let buildoptimizedgcode = function ()
		{
			var sortedpositions = [];

			codestr = gcodeHome ();
			//codestr += gcodeSetAbsolutePositioning();

			// gcode += gcodeResetPosition(0, 0, 0)
			codestr += gcodeSetSpeed(braille.speed);
			//codestr += 'G92 Y0.0;\r\n';
			//codestr += 'G92 X0.0;\r\n';

			if(braille.goToZero) {
				codestr += gcodeMoveTo(0, 0, 0)
			}
			//codestr += gcodeMoveTo(0, 0, braille.headUpPosition);

			GCODEdotposition.sort (function (a,b) {
				if (a.y == b.y) return (a.x - b.x);
				return (a.y - b.y);
			})

			sortedpositions = gcodesortzigzag (GCODEdotposition);

			console.log("posiciones ordenadas:" + sortedpositions.length);

			for (i = 0; i < sortedpositions.length; i++)
			{
				codestr += gcodeMoveTo (sortedpositions[i].x, sortedpositions[i].y);
				codestr += gcodeprintdot ();
			}

			// print svg
			for (i=0; i < GCODEsvgdotposition.length; i++)
			{
				codestr += gcodeMoveTo (GCODEsvgdotposition[i].x, GCODEsvgdotposition[i].y);
				codestr += gcodeprintdot ();
			}


			codestr += gcodeMoveTo (0,290);
			codestr += gcodeMotorOff ();
			return (codestr);
		}
	// dibujar SVG
	let dotAt = (point, gcode, bounds, lastDot)=> {
		let px = braille.invertX ? -point.x : braille.paperWidth - point.x;
		let py = braille.invertY ? -point.y : braille.paperHeight - point.y;
		gcode.code += gcodeMoveTo(braille.mirrorX ? -px : px, braille.mirrorY ? -py : py)
		gcodeGraphDotCached(braille.mirrorX ? -px : px, braille.mirrorY ? -py : py)
		//mover la cabeza de la impresora
		gcode.code += gcodeMoveTo(null, null, braille.headDownPosition)
		if(braille.svgDots || lastDot) {
			gcode.code += gcodeMoveTo(null, null, braille.headUpPosition)
		}
	}

	let itemMustBeDrawn = (item) => {
		return (item.strokeWidth > 0 && item.strokeColor != null) || item.fillColor != null;
	}

	let plotItem = (item, gcode, bounds) => {
		if(!item.visible) {
			return
		}
		let matrix = item.globalMatrix
		if(item.className == 'Shape') {
			let shape = item
			if(itemMustBeDrawn(shape)) {
				let path = shape.toPath(true)
				item.parent.addChildren(item.children)
				item.remove()
				item = path
			}
		}
		if((item.className == 'Path' || item.className == 'CompoundPath') && item.strokeWidth > 0) {
			let path = item
			if(path.segments != null) {
				for(let i=0 ; i<path.length ; i+=braille.svgStep) {
					dotAt(path.getPointAt(i), gcode, bounds, i + braille.svgStep >= path.length)
				}
			}
		}
		if(item.children == null) {
			return
		}
		for(let child of item.children) {
			plotItem(child, gcode, bounds)
		}
	}
	// gcode clasificar por línea
		let gcodesortzigzag = function (positions)
		{
			var i;
			var  s = 0;
			var e = 0;
			var dir = 1;
			var tmp = [];
			var sorted = [];

			if (positions == null)
				return (sorted);

			while (e < positions.length)
			{
				while ((positions[s].y == positions[e].y) )
				{
					console.log("sort pos:" + s + " " + e + " " + positions.length);
					e++;
					console.log("sort posa:" + s + " " + e + " " + positions.length);
					if (e == (positions.length))
					{
						console.log("exit loop" + positions.length);
						break;
					}
				}
				console.log("tipo de posición seleccionada:" + s + " " + e + " " + positions.length);
				//if (e - s >= 0)
				{
					for (i = s; i < e; i++)
					{
						tmp.push (positions[i]);
					}
					tmp.sort (function (a,b) {
						if (a.y == b.y) return ((a.x - b.x) * dir);
							return (a.y - b.y);
					})

					for(i = 0; i < tmp.length; i++)
						sorted.push (tmp[i]);
					tmp = [];
					dir = - dir;


					s = e;
				}
				if (e >= positions.length)
				{
						console.log("exit loop end " + e + " "+positions.length);
						break;
				}
			}

			return (sorted);
		}
	// Genera código
	let svgToGCode = function(svg, gcode) {
		plotItem(svg, gcode, svg.bounds)
	}

	// Dibuja braille y genera gcode
	let brailleToGCode = function() {
		let is8dot = braille.language.indexOf("8 dots") >= 0

		// Calcule la relación de píxel a milímetro
		let paperWidth = braille.paperWidth;
		let paperHeight = braille.paperHeight;

		let canvasWidth = canvas.width / window.devicePixelRatio;
		let canvasHeight = canvas.height / window.devicePixelRatio;

		let realRatio = paperWidth / paperHeight;
		let pixelRatio = canvasWidth / canvasHeight;

		let finalWidthPixel = 0;
		let finalHeightPixel = 0;

		let pixelMillimeterRatio = Math.min(canvasWidth / paperWidth, canvasHeight / paperHeight)

		// Posición arriba / abajo del cabezal de la impresora, en milímetros
		let headUpPosition = braille.headUpPosition;
		let headDownPosition = braille.headDownPosition;

		project.clear();

		// Start GCode
		GCODEdotposition = [];
		gcode = gcodeSetAbsolutePositioning()
		// gcode += gcodeResetPosition(0, 0, 0)
		gcode += gcodeSetSpeed(braille.speed)
		if(braille.goToZero) {
			gcode += gcodeMoveTo(0, 0, 0)
		}
		gcode += gcodeMoveTo(0, 0, headUpPosition)

		// posición de inicialización: arriba a la izquierda + margen
		let currentX = braille.marginWidth;
		let currentY = braille.marginHeight;
		let letterWidth = braille.letterWidth;

		// dibujar límites
		let bounds = new Path.Rectangle(0, 0, Math.max(braille.paperWidth * pixelMillimeterRatio, 0), Math.max(0, braille.paperHeight * pixelMillimeterRatio));
		bounds.strokeWidth = 1;
		bounds.strokeColor = 'black';

		let isWritingNumber = false;

		let textCopy = '' + text
		let textGroup = new Group()

		// iterar a través de cada char: dibujar el código braille y agregar gcode
		for(let i = 0 ; i < textCopy.length ; i++) {
			let char = textCopy[i]

			// verifique casos especiales:
			let charIsCapitalLetter = is8dot ? false : /[A-Z]/.test(char)
			let charIsLineBreak = /\r?\n|\r/.test(char)

			// Si char es un salto de línea:  reset currentX and increase currentY
			if(charIsLineBreak) {
				currentY += (is8dot ? 2 : 3) * letterWidth + braille.linePadding;
				currentX = braille.marginWidth;

				if(currentY > braille.paperHeight - braille.marginHeight) { 				// si no hay suficiente espacio en el papel: stop
					break;
				}
				continue;
			}

			// Verifique si existe character en el mapa
			if(!latinToBraille.has(char.toLowerCase())) {
				console.log('Carácter' + char + ' no fue traducido en braille');
				continue;
			}

			let indices = latinToBraille.get(char);

			// manejar casos especiales:
			if(!isWritingNumber && !isNaN(parseInt(char))) { 			// si no estamos en una secuencia numérica y char es un número: agregue el prefijo e ingrese la secuencia numérica
				indices = numberPrefix;
				i--; 													// vamos a releer el mismo carácter
				isWritingNumber = true;
			} else if(isWritingNumber && char == ' ') {
				isWritingNumber = false;
			} else if( charIsCapitalLetter ) { 							// si es mayúscula: agregue prefijo, letra de caja inferior y vuelva a leer el mismo carácter
				indices = [4, 6];
				textCopy = replaceAt(textCopy, i, textCopy[i].toLowerCase());
				i--;
			}

			// calcular las coordenadas correspondientes de la impresora
			let gx = braille.invertX ? -currentX : braille.paperWidth - currentX;
			let gy = -currentY; 				// el lienzo y el eje va hacia abajo, las impresoras van hacia arriba

			if(braille.delta) { 				// las impresoras delta tienen su origen en el centro de la hoja
				gx -= braille.paperWidth / 2;
				gy += braille.paperHeight / 2;
			} else if(!braille.invertY) {
				gy += braille.paperHeight;
			}

			// agregar gcode
			gcode += gcodeMoveTo(braille.mirrorX ? -gx : gx, braille.mirrorY ? -gy : gy)

			// Dibujar braille char y calcular gcode
			let charGroup = new Group()
			textGroup.addChild(charGroup)

			// Iterar a través de todos los índices
			for(let y = 0 ; y < (is8dot ? 4 : 3) ; y++) {
				for(let x = 0 ; x < 2 ; x++) {

					if(indices.indexOf(dotMap[x][y]) != -1) { 			//si el índice existe en el carácter actual: dibuja el punto
						let px = currentX + x * letterWidth
						let py = currentY + y * letterWidth
						let dot = new Path.Circle(new Point(px * pixelMillimeterRatio, py * pixelMillimeterRatio), (braille.dotRadius / 2) * pixelMillimeterRatio);
						dot.fillColor = 'black';

						charGroup.addChild(dot);

						// Calcule la posición gcode correspondiente
						if(x > 0 || y > 0) {

							gx = braille.invertX ? - px : braille.paperWidth - px;
							gy = -py;						// el lienzo y el eje va hacia abajo, las impresoras van hacia arriba

							if(braille.delta) { 			// las impresoras delta tienen su origen en el centro de la hoja
								gx -= braille.paperWidth / 2;
								gy += braille.paperHeight / 2;
							} else if(!braille.invertY){
								gy += braille.paperHeight;
							}

							gcode += gcodeMoveTo(braille.mirrorX ? -gx : gx, braille.mirrorY ? -gy : gy)
						}

						// mover la cabeza de la impresora
						//gcode += gcodeMoveTo(null, null, headDownPosition)
						//gcode += gcodeMoveTo(null, null, headUpPosition)
						//gcode += braille.GCODEdown + ';\r\n';
						//gcode += braille.GCODEup + ';\r\n';
						gcode += gcodePrintDotCached ();
					}
				}
			}

			// actualizar currentX & currentY
			currentX += braille.letterWidth + braille.letterPadding;

			// Prueba si hay espacio suficiente en la línea para dibujar el siguiente carácter
			if(currentX + braille.letterWidth + braille.dotRadius > braille.paperWidth - braille.marginWidth) { // si no podemos: pasar a la siguiente línea
				currentY += (is8dot ? 2 : 3) * letterWidth + braille.linePadding;
				currentX = braille.marginWidth;
			}

			if(currentY > braille.paperHeight - braille.marginHeight) { 				// si no hay suficiente espacio en el papel: stop
				break;
			}
		}

		let mmPerPixels =  paper.view.bounds.width / braille.paperWidth

		// Imprimir el SVG
		if(svg != null) {
			let gcodeObject = {
				code: gcode
			}

			svg.scaling = 1 / mmPerPixels
			svgToGCode(svg, gcodeObject)
			svg.scaling = mmPerPixels
			gcode = gcodeObject.code
		}

		gcode += gcodeMoveTo(0, 0, headUpPosition)
		if(braille.goToZero) {
			gcode += gcodeMoveTo(0, 0, 0)
		}
		$("#gcode").val(gcode)

		paper.project.activeLayer.addChild(svg)
		let printBounds = textGroup.bounds
		if(svg != null) {
			printBounds = printBounds.unite(svg.bounds)
		}
		printBounds = printBounds.scale(1 / mmPerPixels)
		$('#print-size').text(printBounds.width.toFixed(0) + ' x ' + printBounds.height.toFixed(0))

		// imprimir la posición de los puntos
		let pstr = GCODEdotposition.length + ' ' +'\r\n' ;
		for (d = 0; d < GCODEdotposition.length; d++)
		{
			pstr += '(' + d + ')' + GCODEdotposition[d].x + ' ' + GCODEdotposition[d].y + '\r\n';
		}

		sortedgcode = buildoptimizedgcode();
		$("#dotposition").val (pstr);
		$("#optimizedgcode").val (sortedgcode);
	}

	brailleToGCode()

	// initializeLatinToBraille del archivo de idioma correspondiente
	function initializeLatinToBraille() {

		numberPrefix = languages[braille.language].numberPrefix

		dotMap = languages[braille.language].dotMap

		if(dotMap == null) {
			throw new Error('Dot eight map.')
		}

		// Leer en el archivo de descripción braille
		// latinToBraille.set('a', [1, 2]);
		// latinToBraille.set('b', [1, 4, 5]);
		let brailleJSON = languages[braille.language].latinToBraille

		for(let char in brailleJSON) {
			latinToBraille.set(char, brailleJSON[char])
		}
	}
	initializeLatinToBraille();

	// Crear GUI (Interfaz gráfica de usuario)
	var gui = new dat.GUI({ autoPlace: false });

	var customContainer = document.getElementById('gui');
	customContainer.appendChild(gui.domElement);

	$(gui.domElement).find('.close-button').remove()

	dat.GUI.toggleHide = () => {}

	let createController = function(name, min, max, callback, folder, buttonName) {
		let f = folder != null ? folder : gui
		let controller = f.add(braille, name, min, max);
		controller.onChange(callback != null ? callback : brailleToGCode);
		controller.onFinishChange(callback != null ? callback : brailleToGCode);
		if(buttonName != null) {
			controller.name(buttonName)
		}
		return controller
	}

	let paperDimensionsFolder = gui.addFolder('Dimensiones del Papel');
	createController('paperWidth', 1, 1000, null, paperDimensionsFolder, 'Ancho del papel');
	createController('paperHeight', 1, 1000, null, paperDimensionsFolder, 'Altura del papel');
	createController('marginWidth', 0, 100, null, paperDimensionsFolder, 'Ancho de margen');
	createController('marginHeight', 0, 100, null, paperDimensionsFolder, 'Altura del margen');
	paperDimensionsFolder.open();

	let charDimensionsFolder = gui.addFolder('Dimensiones del caracter');
	createController('letterWidth', 1, 100, null, charDimensionsFolder, 'Ancho de letra');
	createController('dotRadius', 1, 30, null, charDimensionsFolder, 'Radio del punto');
	createController('letterPadding', 1, 30, null, charDimensionsFolder, 'Separar letras');
	createController('linePadding', 1, 30, null, charDimensionsFolder, 'Separar líneas');
	charDimensionsFolder.open();

	let printerSettingsFolder = gui.addFolder('Configuración de la impresora');
	createController('headDownPosition', -150, 150, null, printerSettingsFolder, 'Cabezal abajo pos.');
	createController('headUpPosition', -150, 150, null, printerSettingsFolder, 'Cabezal arriba pos.');
	createController('speed', 0, 6000, null, printerSettingsFolder, 'Speed');
	createController('delta', null, null, null, printerSettingsFolder, 'Delta printer');
	createController('invertX', null, null, null, printerSettingsFolder, 'Negative X');
	createController('invertY', null, null, null, printerSettingsFolder, 'Negative Y');
	createController('mirrorX', null, null, null, printerSettingsFolder, 'Mirror X');
	createController('mirrorY', null, null, null, printerSettingsFolder, 'Mirror Y');
	createController('goToZero', null, null, null, printerSettingsFolder, 'Ir a cero');
	createController('GCODEup', null, null, null, printerSettingsFolder, 'GCODE Up');
	createController('GCODEdown', null, null, null, printerSettingsFolder, 'GCODE down');

	printerSettingsFolder.open();

	var languageList = []
	for(let lang in languages) {
		languageList.push(lang)
	}

	createController('language', languageList, null, function() {
		initializeLatinToBraille();
		brailleToGCode();
	}, null, 'Idioma');

	// Importar SVG para agregar formas
	divJ = $("<input data-name='file-selector' type='file' class='form-control' name='file[]'  accept='image/svg+xml'/>")

	let importSVG = (event)=> {
		svgButton.name('Limpiar SVG')
		svg = paper.project.importSVG(event.target.result)
		svg.strokeScaling = false
		svg.pivot = svg.bounds.topLeft
		let mmPerPixels =  paper.view.bounds.width / braille.paperWidth
		svg.scaling = mmPerPixels
		brailleToGCode()
		svg.sendToBack()
	}

	let handleFileSelect = (event) => {
		let files = event.dataTransfer != null ? event.dataTransfer.files : event.target.files

		for (let i = 0; i < files.length; i++) {
			let file = files.item(i)

			let imageType = /^image\//

			if (!imageType.test(file.type)) {
				continue
			}

			let reader = new FileReader()
			reader.onload = (event)=> importSVG(event)
			reader.readAsText(file)
		}
	}
	let svgFolder = gui.addFolder('SVG');
	svgButton = svgFolder.add({importSVG: ()=> {
		if(svg != null) {
			svgButton.name('Importar SVG')
			svg.remove()
			svg = null
			brailleToGCode()
		} else {
			divJ.click()
		}

	} }, 'importSVG')
	svgButton.name('Importar SVG')

	divJ.click((event)=>{
		event.stopPropagation()
		return -1;
	})
	$(svgButton.domElement).append(divJ)
	divJ.hide()
	divJ.change(handleFileSelect)

	// Agregar botón de descarga (para obtener un archivo de texto del gcode)
/*	gui.add({saveGCode: function(){
		var a = document.body.appendChild(
			document.createElement("a")
		);
		a.download = "braille.gcode";
		a.href = encodeURI("data:text/plain;charset=utf-8," + gcode);

		a.click(); // Dispara un clic en el elemento
		a.remove();

	}}, 'saveGCode').name('Save GCode')*/
	gui.add({saveOptimGCode: function(){
		var a = document.body.appendChild(
			document.createElement("a")
		);
		a.download = "braille.gcode";
		a.href = encodeURI("data:text/plain;charset=utf-8," + sortedgcode);

		a.click(); // Dispara un clic en el elemento
		a.remove();

	}}, 'saveOptimGCode').name('Descargar GCode')

	createController('svgStep', 0, 100, null, svgFolder, 'SVG step');
	createController('svgDots', null, null , null, svgFolder, 'SVG dots');
	let updateSVGPositionX = (value) => {
		let mmPerPixels =  paper.view.bounds.width / braille.paperWidth
		svg.position.x = value * mmPerPixels
		brailleToGCode()
	}
	let updateSVGPositionY = (value) => {
		let mmPerPixels =  paper.view.bounds.width / braille.paperWidth
		svg.position.y = value * mmPerPixels
		brailleToGCode()
	}
	createController('svgPosX', -500, 500, updateSVGPositionX, svgFolder, 'SVG pos X');
	createController('svgPosY', -500, 500, updateSVGPositionY, svgFolder, 'SVG pos Y');
	// createController('svgScale', 0.05, 10, null, svgFolder, 'SVG scale');

	// Actualizar todo cuando el texto cambie
	$('#latin').bind('input propertychange', function(event) {
		text = $("#latin").val();
		$('#braille').val(text);
		brailleToGCode(text);
	})

	// Update all when text changes
	$('#braille').bind('input propertychange', function(event) {
		text = $("#braille").val();
		$('#latin').val(text);
		brailleToGCode(text);
	})

})
