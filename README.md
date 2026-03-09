# ClickFinity Baseplate Generator

A browser-based tool that generates custom-sized [ClickFinity](https://makerworld.com/en/models/581269)-compatible Gridfinity baseplates. Enter your drawer dimensions, and it outputs print-ready STL/3MF files that tile together to fill the entire space.

## Usage

1. Serve locally: `python3 -m http.server 8000`
2. Open `http://localhost:8000` in your browser
3. Enter drawer width and depth (mm)
4. Click **Generate**
5. Download as ZIP (STLs) or 3MF (Single File)

**Note:** When importing the 3MF into your slicer (BambuStudio, OrcaSlicer, etc.), you will need to manually add plates and arrange objects onto them. Ojbjects should appear in the right orientation for easy movement to build plates. You may also get a manifold edge error, just click repair in your slicer. 

## Features

- Arbitrary drawer sizes (55-2000mm)
- Automatic panel splitting to fit 256mm print beds
- Connector strips with joiner tabs between panels
- Edge fill for leftover space along drawer walls
- 3D preview with orbit controls
- Adjustable joiner nub offset for fit tuning

## Print Settings

- **Material:** Tested PETG and PLA. PETG works better for the springy bits.
- **Layer height:** 0.20mm
- **Walls:** 2
- **Infill:** 15
- **Supports:** None
