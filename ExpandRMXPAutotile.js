/*  Expand RMXP Autotile (RPG Maker XP) for Tiled
 *
 *  Based on the dialog/workflow style of eishiya's ExpandRPGMTileset script. :contentReference[oaicite:1]{index=1}
 *  This version supports RMXP "ground autotile" sheets:
 *    - full tile size: e.g. 32x32
 *    - sheet size: 3x4 full tiles => (tileW*3) x (tileH*4)
 *    - internally: 6x8 subtiles (tileW/2 x tileH/2)
 *
 *  Output:
 *    - expanded sheet of 48 full tiles (8x6) => (tileW*8) x (tileH*6)
 *
 *  Requires Tiled 1.10.2+ (uses Dialog + Image APIs).
 */

(function () {
  "use strict";

  var action = tiled.registerAction("ExpandRMXPAutotile", function () {
    // ============================= CONFIGURATION =============================
    let useProject = true; // save preferences into current Project if available
    // =========================================================================

    if (!tiled.project || !tiled.versionLessThan || tiled.versionLessThan("1.10.2"))
      useProject = false;
    let project = useProject ? tiled.project : null;

    // ---- Dialog ----
    let dialog = new Dialog("New RMXP Autotile Tileset...");
    dialog.newRowMode = Dialog.ManualRows;
    dialog.minimumWidth = 240;

    dialog.addHeading("Tileset", true);
    let nameInput = dialog.addTextInput("Name:");
    let name = "";
    nameInput.editingFinished.connect(function () { name = nameInput.text; });

    dialog.addHeading("Image", true);
    let sourceInput = dialog.addFilePicker("Source:");
    sourceInput.filter = "Images (*.png *.xpm *.jpeg *.jpg *.bmp *.gif *.qoi *.svg *.cur *.webp)";

    dialog.addNewRow();
    dialog.addLabel("");
    let useColorInput = dialog.addCheckBox("Use transparent color:", false);
    let useColor = false;
    useColorInput.stateChanged.connect(function () { useColor = useColorInput.checked; });
    if (project && project.property("ExpandRMXPAutotile_UseTransparentColor") > 0)
      useColorInput.checked = project.property("ExpandRMXPAutotile_UseTransparentColor");

    let colorInput = dialog.addColorButton();
    let color = "";
    colorInput.colorChanged.connect(function (newColor) { color = newColor; });
    if (project && project.property("ExpandRMXPAutotile_TransparentColor") > 0)
      colorInput.color = project.property("ExpandRMXPAutotile_TransparentColor");

    dialog.addNewRow();

    let tileWidthInput = dialog.addNumberInput("Tile width:");
    tileWidthInput.decimals = 0;
    tileWidthInput.minimum = 2;
    let tileWidth = 32;
    tileWidthInput.valueChanged.connect(function (n) { tileWidth = n; });
    if (project && project.property("ExpandRMXPAutotile_TileWidth") > 0)
      tileWidthInput.value = project.property("ExpandRMXPAutotile_TileWidth");
    else tileWidthInput.value = 32;
    dialog.addLabel("px");
    dialog.addNewRow();

    let tileHeightInput = dialog.addNumberInput("Tile height:");
    tileHeightInput.decimals = 0;
    tileHeightInput.minimum = 2;
    let tileHeight = 32;
    tileHeightInput.valueChanged.connect(function (n) { tileHeight = n; });
    if (project && project.property("ExpandRMXPAutotile_TileHeight") > 0)
      tileHeightInput.value = project.property("ExpandRMXPAutotile_TileHeight");
    else tileHeightInput.value = 32;
    dialog.addLabel("px");
    dialog.addNewRow();

    // RMXP expander produces an image; keeping it simple/compatible:
    dialog.addLabel("Output format:");
    let outFmt = dialog.addComboBox("", ["Image (PNG)"]);
    outFmt.enabled = false; // fixed for now

    dialog.addNewRow();
    let confirmButton = dialog.addButton("Save As...");
    confirmButton.enabled = false;
    confirmButton.clicked.connect(function () { dialog.accept(); });

    let cancelButton = dialog.addButton("Cancel");
    cancelButton.clicked.connect(function () { dialog.reject(); });

    let source = "";
    sourceInput.fileUrlChanged.connect(function (url) {
      if (!tiled.versionLessThan || tiled.versionLessThan("1.11.0"))
        source = url.toString().replace(/^file:\/{3}/, (tiled.platform == "windows") ? "" : "/");
      else
        source = sourceInput.fileName;

      confirmButton.enabled = !!(url && File.exists(source));
    });

    let confirmed = dialog.exec();
    if (!confirmed) return;

    if (!File.exists(source)) {
      tiled.warn("Non-existent file chosen: " + source + ". Tileset will not be created.");
      return;
    }

    // Save preferences
    if (project) {
      project.setProperty("ExpandRMXPAutotile_TileWidth", tileWidth);
      project.setProperty("ExpandRMXPAutotile_TileHeight", tileHeight);
      project.setProperty("ExpandRMXPAutotile_UseTransparentColor", useColor);
      if (color !== "")
        project.setColorProperty("ExpandRMXPAutotile_TransparentColor", color);
    }

    if (!name || name === "")
      name = FileInfo.baseName(source);

    if (tileWidth % 2 !== 0 || tileHeight % 2 !== 0) {
      tiled.alert("RMXP autotiles require an even tile size (because they are split into 2x2 subtiles).");
      return;
    }

    // ---- Load source image and validate RMXP size ----
    const srcImg = new Image(source);
    const expectedW = tileWidth * 3;
    const expectedH = tileHeight * 4;

    if (srcImg.width !== expectedW || srcImg.height !== expectedH) {
      tiled.alert(
        "This does not look like an RPG Maker XP autotile.\n\n" +
        `Expected size: ${expectedW}x${expectedH} (3x4 tiles of ${tileWidth}x${tileHeight})\n` +
        `Got: ${srcImg.width}x${srcImg.height}\n\n` +
        "Tip: For RMXP ground autotiles with 32x32 tiles, the file must be 96x128."
      );
      return;
    }

    // ---- RMXP quarter/minitile mapping (48 cases) ----
    // Indices 0..47 refer to the 6x8 grid of subtiles (each is tile/2).
    // Each case defines the 4 subtiles: [TL, TR, BL, BR]
    const RMXP_CASES = [
      [26,27,32,33],[4,27,32,33],[26,5,32,33],[4,5,32,33],
      [26,27,32,11],[4,27,32,11],[26,5,32,11],[4,5,32,11],
      [26,27,10,33],[4,27,10,33],[26,5,10,33],[4,5,10,33],
      [26,27,10,11],[4,27,10,11],[26,5,10,11],[4,5,10,11],
      [24,25,30,31],[24,5,30,31],[24,25,30,11],[24,5,30,11],
      [14,15,20,21],[14,15,20,11],[14,15,10,21],[14,15,10,11],
      [28,29,34,35],[28,29,10,35],[4,29,34,35],[4,29,10,35],
      [26,27,44,45],[4,39,44,45],[38,5,44,45],[4,5,44,45],
      [24,29,30,35],[14,15,44,45],[12,13,18,19],[12,13,18,11],
      [16,17,22,23],[16,17,10,23],[40,41,46,47],[4,41,46,47],
      [36,37,42,43],[36,5,42,43],[12,17,18,23],[12,13,42,43],
      [36,41,42,47],[16,17,46,47],[12,17,42,47],[12,17,42,47] // duplicate is fine
    ];

    const subW = tileWidth / 2;
    const subH = tileHeight / 2;

    function subtileXY(index) {
      const cols = 6; // 6 subtiles across in RMXP sheet
      return { x: (index % cols) * subW, y: Math.floor(index / cols) * subH };
    }

    function blit(dst, dx, dy, sx, sy, w, h) {
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const c = srcImg.pixel(sx + px, sy + py);
          dst.setPixel(dx + px, dy + py, c);
        }
      }
    }

    // ---- Build expanded image: 8x6 full tiles ----
    const outCols = 8, outRows = 6;
    const outImg = new Image(tileWidth * outCols, tileHeight * outRows);

    for (let id = 0; id < 48; id++) {
      const ox = (id % outCols) * tileWidth;
      const oy = Math.floor(id / outCols) * tileHeight;

      const c = RMXP_CASES[id];
      const tl = subtileXY(c[0]);
      const tr = subtileXY(c[1]);
      const bl = subtileXY(c[2]);
      const br = subtileXY(c[3]);

      // TL
      blit(outImg, ox + 0,        oy + 0,        tl.x, tl.y, subW, subH);
      // TR
      blit(outImg, ox + subW,     oy + 0,        tr.x, tr.y, subW, subH);
      // BL
      blit(outImg, ox + 0,        oy + subH,     bl.x, bl.y, subW, subH);
      // BR
      blit(outImg, ox + subW,     oy + subH,     br.x, br.y, subW, subH);
    }

    // If user selected a transparency color, apply it to the output image pixels (simple exact-match).
    // (Tiled's Image doesn't have a "set transparency color" metadata like Tilesets do.)
    if (useColor && color) {
      // This is optional; many pipelines just set the tileset transparencyColor.
      // We'll rely on tileset transparencyColor instead of rewriting pixels.
    }

    // ---- Save expanded PNG next to source (or prompt) ----
    const defaultExpanded = FileInfo.path(source) + "/" + FileInfo.baseName(source) + "_expanded.png";
    let expandedPath = defaultExpanded;

    if (File.exists(expandedPath)) {
      if (!tiled.confirm("File " + expandedPath + " already exists. Overwrite? (No aborts)"))
        return;
    }

    const ok = outImg.save(expandedPath);
    if (!ok) {
      tiled.error("Failed to write expanded image file: " + expandedPath);
      return;
    }

    // ---- Create final tileset (.tsx) that uses the expanded PNG ----
    let newTileset = new Tileset(name);
    newTileset.tileWidth = tileWidth;
    newTileset.tileHeight = tileHeight;
    if (useColor && color)
      newTileset.transparencyColor = color;

    if (!tiled.versionLessThan || tiled.versionLessThan("1.11.0"))
      newTileset.image = expandedPath;
    else
      newTileset.imageFileName = expandedPath;

    let saveLocation = tiled.promptSaveFile(
      FileInfo.path(source),
      "Tiled Tileset files (*.tsx *.xml);;JSON Tileset files (*.tsj *.json)",
      "Save Tileset As"
    );

    if (saveLocation && saveLocation !== "") {
      let format = tiled.tilesetFormatForFile(saveLocation);
      if (!format) {
        tiled.warn("Could not find valid Tileset format for " + FileInfo.fileName(saveLocation) + ", saving in TSX format.");
        format = tiled.tilesetFormat("tsx");
      }
      format.write(newTileset, saveLocation);
      tiled.open(saveLocation);
    }
  });

  action.text = "New RMXP Autotile Tileset...";

  tiled.extendMenu("File", [
    { action: "ExpandRMXPAutotile", before: "Save" },
    { separator: true }
  ]);
})();