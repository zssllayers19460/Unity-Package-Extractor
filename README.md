# Unity Package Extractor Pro 

A lightning-fast, secure web tool that allows game developers and artists to inspect, browse, filter, and extract assets directly from `.unitypackage` files inside their browser. **No server uploads required - everything runs 100% locally client-side.**

## ✨ Features

- **Client-Side Extraction**: Instantly unpacks `.unitypackage` tarballs using `fflate` without sending your files anywhere.
- **Visual Image Gallery**: Automatically detects texture assets (PNG, JPG, JPEG, GIF, BMP) and renders a responsive gallery view with adjustable thumbnail scaling, sorting, and transparency grids.
- **Incremental Progress Tracking**: Real-time progress bars for file reading, chunk-based TAR extraction, and ZIP assembly.
- **Smart Filtering & Selection**: Multi-select support with Shift-click range selections, search filtering, and category-based bulk downloads.
- **Flexible Export Options**: 
  - Exclude/include Unity `.meta` files.
  - Categorize by type or preserve original folder structures.
  - Optional ZIP compression level toggles.
- **Theme Support**: Built-in Auto/Light/Dark mode switcher optimized to look clean under custom browser dark modes and extensions (like Opera Force Dark).
- **Instant Tooltips**: Clear helpful hints on every setting and option.

## 🛠️ Built With

- **HTML5 / Modern CSS3** (Custom properties, grid layout, responsive design)
- **Vanilla JavaScript (ES6+)**
- **[fflate](https://github.com/101arrowz/fflate)** (High-performance compression and inflation library)

## 📦 How to Use

1. Open the tool in any modern web browser.
2. Drag and drop your `.unitypackage` file into the drop zone (or click to browse).
3. Browse through individual assets, preview textures, or use the search bar to locate specific scripts or models.
4. Download individual categories, selected items, or the entire package as a `.zip` file instantly.

## 💡 Acknowledgments & Inspiration

This project was built as an enhanced, feature-rich iteration leveraging concepts and structural design inspired by open-source tools:
- [peraperavrc/package-extractor](https://github.com/peraperavrc/package-extractor)
- [bengreenier-archive/unity-package-extract](https://github.com/bengreenier-archive/unity-package-extract)

## 📄 License

MIT License - Feel free to use, modify, and build upon this tool for your game development workflows!