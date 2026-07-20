const glob = require('glob');
const fs = require('fs');
const path = require('path');
const data = require('./data.js');
const mustache = require('mustache');

const symbolFileTemplate = fs.readFileSync('./src/templates/symbol.tsx.mustache', {
    encoding: 'utf-8',
});
const packageFileTemplate = fs.readFileSync('./src/templates/package.json.mustache', {
    encoding: 'utf-8',
});
const tsConfigFileTemplate = fs.readFileSync('./src/templates/tsconfig.json.mustache', {
    encoding: 'utf-8',
});
const readmeFileTemplate = fs.readFileSync('./src/templates/README.md.mustache', {
    encoding: 'utf-8',
});

// The generated packages intentionally support direct imports only
// (`package/IconName`). Avoiding a root barrel keeps IDE auto-imports and
// bundlers away from a file that references every generated icon.
function printHelp() {
    process.stdout.write(`Usage: npm run transform -- <packages-dir> [options]

Options:
  --source <dir>       Material Design Icons checkout. Default: .icons
  --metadata <file>    Google Fonts Material Symbols metadata. Default: .metadata/material-symbols.json
  --icons <list>       Comma-separated official symbol slugs, e.g. home,spa
  --icons-file <file>  File with symbol slugs separated by newlines or commas
  --styles <list>      Comma-separated styles: outlined,rounded,sharp
  --weights <list>     Comma-separated weights: 100,200,300,400,500,600,700
  --grades <list>      Comma-separated grades: 0,-25,200. Default: 0
  --fills <list>       Comma-separated fills: 0,1 or false,true. Default: 0,1
  --help               Show this help

Examples:
  npm run transform -- .packages
  npm run transform -- .packages-test --metadata .metadata/material-symbols.json --icons home,spa --styles outlined --weights 400 --grades -25 --fills 0,1
`);
}

function parseList(value) {
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function readOptionValue(args, index, optionName) {
    const next = args[index + 1];

    if (next == null || next.startsWith('--')) {
        throw new Error(`Missing value for ${optionName}`);
    }

    return next;
}

function parseArgs(argv) {
    const options = {
        packagesDir: null,
        sourceDir: '.icons',
        metadataFile: '.metadata/material-symbols.json',
        icons: null,
        styles: new Set(data.styles),
        weights: new Set(data.weights),
        grades: new Set([0]),
        fills: new Set([false, true]),
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const [optionName, inlineValue] = arg.split('=', 2);
        const hasInlineValue = inlineValue != null;

        if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        }

        if (!arg.startsWith('--')) {
            if (options.packagesDir != null) {
                throw new Error(`Unexpected positional argument: ${arg}`);
            }

            options.packagesDir = arg;
            continue;
        }

        const value = hasInlineValue ? inlineValue : readOptionValue(argv, i, optionName);

        if (!hasInlineValue) {
            i++;
        }

        switch (optionName) {
            case '--source':
                options.sourceDir = value;
                break;
            case '--metadata':
                options.metadataFile = value;
                break;
            case '--icons':
                options.icons = new Set(parseList(value));
                break;
            case '--icons-file': {
                const content = fs.readFileSync(value, {encoding: 'utf-8'});
                const icons = content
                    .split(/[\n,]/)
                    .map((item) => item.replace(/#.*/, '').trim())
                    .filter(Boolean);
                options.icons = new Set([...(options.icons || []), ...icons]);
                break;
            }
            case '--styles':
                options.styles = new Set(parseList(value));
                break;
            case '--weights':
                options.weights = new Set(parseList(value).map((weight) => parseInt(weight, 10)));
                break;
            case '--grades':
                options.grades = new Set(parseList(value).map(parseGrade));
                break;
            case '--fills':
                options.fills = new Set(parseList(value).map(parseFill));
                break;
            default:
                throw new Error(`Unknown option: ${optionName}`);
        }
    }

    if (options.packagesDir == null) {
        throw new Error('Missing required <packages-dir> argument.');
    }

    validateOptions(options);

    return options;
}

function loadSupportedIconsByStyle(metadataFile) {
    if (!fs.existsSync(metadataFile)) {
        throw new Error(`Material Symbols metadata file not found: ${metadataFile}. Run "make metadata" or pass --metadata <file>.`);
    }

    const rawContent = fs.readFileSync(metadataFile, {
        encoding: 'utf-8',
    });

    let metadata;

    try {
        metadata = JSON.parse(stripJsonPrefix(rawContent));
    } catch (error) {
        throw new Error(`Could not parse Material Symbols metadata file: ${metadataFile}. ${error.message}`);
    }

    if (!Array.isArray(metadata.icons)) {
        throw new Error(`Material Symbols metadata file has no icons array: ${metadataFile}`);
    }

    const supportedIconsByStyle = new Map(
        data.styles.map((style) => [style, new Set()]),
    );

    for (const icon of metadata.icons) {
        if (icon == null || typeof icon.name !== 'string') {
            continue;
        }

        const unsupportedFamilies = new Set(
            Array.isArray(icon.unsupported_families) ? icon.unsupported_families : [],
        );

        // Google keeps older aliases in the repository and codepoint files.
        // The metadata endpoint is the source that tells us whether a slug is
        // actually supported by the current Material Symbols family.
        for (const [style, familyName] of Object.entries(data.symbolFamilyNames)) {
            if (!unsupportedFamilies.has(familyName)) {
                supportedIconsByStyle.get(style).add(icon.name);
            }
        }
    }

    return supportedIconsByStyle;
}

function stripJsonPrefix(content) {
    return content.replace(/^\)\]\}'\s*/, '');
}

function parseGrade(value) {
    const normalizedValue = value.toLowerCase().replace(/^grad/, '');

    if (normalizedValue === '0' || normalizedValue === 'default') {
        return 0;
    }

    if (/^-?\d+$/.test(normalizedValue)) {
        return parseInt(normalizedValue, 10);
    }

    if (/^n\d+$/.test(normalizedValue)) {
        return -parseInt(normalizedValue.slice(1), 10);
    }

    if (/^p\d+$/.test(normalizedValue)) {
        return parseInt(normalizedValue.slice(1), 10);
    }

    throw new Error(`Unsupported grade value: ${value}`);
}

function parseFill(value) {
    switch (value.toLowerCase()) {
        case '0':
        case 'false':
        case 'fill0':
        case 'unfilled':
            return false;
        case '1':
        case 'true':
        case 'fill1':
        case 'filled':
            return true;
        default:
            throw new Error(`Unsupported fill value: ${value}`);
    }
}

function validateOptions(options) {
    for (const style of options.styles) {
        if (!data.styles.includes(style)) {
            throw new Error(`Unsupported style: ${style}. Expected one of: ${data.styles.join(', ')}`);
        }
    }

    for (const weight of options.weights) {
        if (!data.weights.includes(weight)) {
            throw new Error(`Unsupported weight: ${weight}. Expected one of: ${data.weights.join(', ')}`);
        }
    }

    for (const grade of options.grades) {
        if (!data.grades.includes(grade)) {
            throw new Error(`Unsupported grade: ${formatGrade(grade)}. Expected one of: ${data.grades.map(formatGrade).join(', ')}`);
        }
    }

    if (options.grades.size === 0) {
        throw new Error('At least one grade value must be selected.');
    }

    if (options.fills.size === 0) {
        throw new Error('At least one fill value must be selected.');
    }
}

function findFiles(options) {
    const symbolsWebDir = path.join(options.sourceDir, 'symbols', 'web');

    if (!fs.existsSync(symbolsWebDir)) {
        throw new Error(`Material Symbols source directory not found: ${symbolsWebDir}. Run "make icons" or pass --source <dir>.`);
    }

    const styleDirs = getSelectedStyleDirs(options);

    if (options.icons != null) {
        // Subset builds are the common local workflow. Reading the selected
        // symbol directories directly avoids walking Google's full tree.
        return findFilesForSelectedIcons(options, styleDirs);
    }

    // Full builds still avoid unnecessary style directories and only consider
    // the web SVG files that can become package components.
    return styleDirs
        .flatMap((styleDir) => glob.globSync(`${options.sourceDir}/symbols/web/*/${styleDir}/*.svg`))
        .filter((file) => isSelectedSvgFile(path.basename(file), options))
        .sort();
}

function findFilesForSelectedIcons(options, styleDirs) {
    const files = [];

    for (const icon of [...options.icons].sort()) {
        for (const styleDir of styleDirs) {
            const style = data.styleNames[styleDir];

            if (!isSupportedIconForStyle(options, icon, style)) {
                continue;
            }

            const iconStyleDir = path.join(options.sourceDir, 'symbols', 'web', icon, styleDir);

            if (!fs.existsSync(iconStyleDir)) {
                continue;
            }

            for (const fileName of fs.readdirSync(iconStyleDir)) {
                if (isSelectedSvgFile(fileName, options)) {
                    files.push(path.join(iconStyleDir, fileName));
                }
            }
        }
    }

    return files.sort();
}

function getSelectedStyleDirs(options) {
    return Object
        .entries(data.styleNames)
        .filter(([, style]) => options.styles.has(style))
        .map(([styleDir]) => styleDir);
}

function isSelectedSvgFile(fileName, options) {
    if (!fileName.endsWith('_24px.svg')) {
        return false;
    }

    const weight = getWeightFromFileName(fileName);
    const grade = getGradeFromFileName(fileName);
    const filled = isFilledFileName(fileName);

    return options.weights.has(weight) && options.grades.has(grade) && options.fills.has(filled);
}

/**
 * Prepare files for processing.
 * @param {string[]} files Array of file paths.
 * @returns {ProcessedFile[]} Processed array of file paths.
 */
function prepareFiles(files, options) {
    const processedFiles = [];

    for (const file of files) {
        const fileMetadata = getFileMetadata(file);

        if (fileMetadata == null) {
            continue;
        }

        const {nameRaw, styleRaw, baseName} = fileMetadata;
        const {
            pascalCaseName,
        } = transformName(nameRaw);
        const style = data.styleNames[styleRaw];

        if (style == null) {
            continue;
        }

        if (!isSupportedIconForStyle(options, nameRaw, style)) {
            continue;
        }

        const weight = getWeightFromFileName(baseName);
        const grade = getGradeFromFileName(baseName);
        const filled = isFilledFileName(baseName);

        if (options.icons != null && !options.icons.has(nameRaw)) {
            continue;
        }

        if (!options.styles.has(style) || !options.weights.has(weight) || !options.grades.has(grade) || !options.fills.has(filled)) {
            continue;
        }

        processedFiles.push({
            originalPath: file,
            pascalCaseName: pascalCaseName,
            nameRaw: nameRaw,
            style: style,
            weight: weight,
            grade: grade,
            filled: filled,
            filename: null,
        });
    }

    assignComponentFilenames(processedFiles);

    return processedFiles;
}

function isSupportedIconForStyle(options, iconName, style) {
    if (style == null) {
        return false;
    }

    const supportedIcons = options.supportedIconsByStyle.get(style);

    return supportedIcons != null && supportedIcons.has(iconName);
}

function getUnsupportedSelectedIconStyles(options) {
    if (options.icons == null) {
        return [];
    }

    const unsupported = [];

    for (const icon of [...options.icons].sort()) {
        for (const style of [...options.styles].sort()) {
            if (!isSupportedIconForStyle(options, icon, style)) {
                unsupported.push(`${icon}/${style}`);
            }
        }
    }

    return unsupported;
}

function formatLimitedList(items, limit) {
    if (items.length <= limit) {
        return items.join(', ');
    }

    return `${items.slice(0, limit).join(', ')} and ${items.length - limit} more`;
}

function getWeightFromFileName(fileName) {
    const weightMatch = fileName.match(/wght(\d+)/);

    return weightMatch ? parseInt(weightMatch[1], 10) : 400;
}

function getGradeFromFileName(fileName) {
    const gradeMatch = fileName.match(/grad(N?\d+)/);

    if (gradeMatch == null) {
        return 0;
    }

    return parseGrade(gradeMatch[1]);
}

function isFilledFileName(fileName) {
    return fileName.includes('fill1');
}

function getFileMetadata(file) {
    const normalizedPath = file.split(path.sep).join('/');
    const marker = '/symbols/web/';
    const markerIndex = normalizedPath.indexOf(marker);

    if (markerIndex === -1) {
        return null;
    }

    const relativePath = normalizedPath.slice(markerIndex + marker.length);
    const pathParts = relativePath.split('/');

    if (pathParts.length < 3) {
        return null;
    }

    return {
        nameRaw: pathParts[0],
        styleRaw: pathParts[1],
        baseName: pathParts[pathParts.length - 1],
    };
}

function assignComponentFilenames(processedFiles) {
    const filesByPackage = new Map();

    for (const file of processedFiles) {
        const key = getPackageKey(file.style, file.weight, file.grade);

        if (!filesByPackage.has(key)) {
            filesByPackage.set(key, []);
        }

        filesByPackage.get(key).push(file);
    }

    for (const files of filesByPackage.values()) {
        files.sort((a, b) => {
            if (a.filled !== b.filled) {
                return a.filled ? 1 : -1;
            }

            return a.pascalCaseName.localeCompare(b.pascalCaseName);
        });

        const usedFilenames = new Set();

        for (const file of files) {
            let filename = `${file.pascalCaseName}${file.filled ? 'Filled' : ''}`;

            // Some official symbol slugs already end in `_filled`, e.g.
            // `person_filled`. This disambiguates that component from the
            // fill=1 variant of `person` without changing the official slug.
            while (usedFilenames.has(filename)) {
                filename = `${filename}Filled`;
            }

            file.filename = filename;
            usedFilenames.add(filename);
        }
    }

    processedFiles.sort((a, b) => {
        const packageCompare = getPackageKey(a.style, a.weight, a.grade).localeCompare(getPackageKey(b.style, b.weight, b.grade));

        if (packageCompare !== 0) {
            return packageCompare;
        }

        return a.filename.localeCompare(b.filename);
    });
}

/**
 *
 * @param {string} name
 * @returns {{pascalCaseName: string}} Transformed names.
 */
function transformName(name) {
    if (/^\d+.*$/.test(name)) {
        const extractedNumberPrefix = name.match(/^\d+/)[0];
        const numberAsWords = numberToWords(extractedNumberPrefix).join('_');
        const rest = name.slice(extractedNumberPrefix.length);
        name = `${numberAsWords}${rest ? `_${rest}` : ''}`;
    }

    const pascalCaseName = name
        .split(/[_-]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');

    return {
        pascalCaseName,
    };
}

/**
 * Convert a numeric slug prefix to identifier-safe word parts.
 * @param {string} numberText The numeric slug prefix.
 * @returns {string[]}
 */
function numberToWords(numberText) {
    if (numberText === '360') {
        return ['three', 'sixty'];
    }

    const number = parseInt(numberText, 10);

    if (number < 100) {
        return numberUnderOneHundredToWords(number);
    }

    return numberText
        .split('')
        .map((digit) => numberUnderOneHundredToWords(parseInt(digit, 10))[0]);
}

function numberUnderOneHundredToWords(number) {
    if (data.numberToWordMap[number] != null) {
        return [data.numberToWordMap[number]];
    }

    const tens = Math.floor(number / 10) * 10;
    const units = number % 10;

    return [
        data.numberToWordMap[tens],
        data.numberToWordMap[units],
    ];
}

function getPackageKey(style, weight, grade) {
    return `${style}|${weight}|${grade}`;
}

function getPackageName(weight, grade, style) {
    return `mui-material-symbols-${weight}${getGradePackageSegment(grade)}-${style}`;
}

function getGradePackageSegment(grade) {
    if (grade === 0) {
        return '';
    }

    return grade < 0
        ? `-n${Math.abs(grade)}`
        : `-p${grade}`;
}

function parseGradePackageSegment(segment) {
    if (segment == null) {
        return 0;
    }

    return parseGrade(segment);
}

function formatGrade(grade) {
    return grade > 0 ? `+${grade}` : `${grade}`;
}

function getTargetDir(packagesDir, style, weight, grade) {
    return `${packagesDir}/${getPackageName(weight, grade, style)}`;
}

/**
 * Write the template for the processed file.
 * @param {ProcessedFile} processedFile The processed file object.
 * @param {string} packagesDir Output packages directory.
 * @returns {void}
 */
function writeTemplate(processedFile, packagesDir) {
    const targetFolder = `${getTargetDir(packagesDir, processedFile.style, processedFile.weight, processedFile.grade)}/src`;
    fs.mkdirSync(targetFolder, {
        recursive: true,
    });

    let originalContent = fs.readFileSync(processedFile.originalPath, {
        encoding: 'utf-8',
    });

    originalContent = originalContent
        .replace(/^\s*<svg[^>]*>/, '')
        .replace('</svg>', '')
        .trim();

    const renderedContent = mustache.render(symbolFileTemplate, {
        symbolComponentName: processedFile.filename,
        originalContent: originalContent,
    });

    const targetFile = `${targetFolder}/${processedFile.filename}.tsx`;
    writeFileIfChanged(targetFile, renderedContent);
}

function writePackageFiles(preparedFiles, options) {
    const filesByPackage = new Map();

    for (const processedFile of preparedFiles) {
        const key = getPackageKey(processedFile.style, processedFile.weight, processedFile.grade);

        if (!filesByPackage.has(key)) {
            filesByPackage.set(key, []);
        }

        filesByPackage.get(key).push(processedFile);
    }

    // A filtered rebuild into the same output directory should not leave old
    // generated packages around. Only directories following our generator
    // naming scheme are candidates for removal.
    removeStalePackageDirs(options.packagesDir, new Set(filesByPackage.keys()));

    for (const [packageKey, files] of filesByPackage) {
        const [style, weightRaw, gradeRaw] = packageKey.split('|');
        const weight = parseInt(weightRaw, 10);
        const grade = parseInt(gradeRaw, 10);
        const packageName = getPackageName(weight, grade, style);
        const targetDir = getTargetDir(options.packagesDir, style, weight, grade);
        const sourceDir = `${targetDir}/src`;
        const distDir = `${targetDir}/dist`;

        fs.mkdirSync(sourceDir, {
            recursive: true,
        });

        // Keep the output incremental: remove generated files that no longer
        // belong to this package, but do not delete the whole directory. This
        // preserves TypeScript's incremental build info and avoids touching
        // unchanged files.
        removeStaleGeneratedFiles(sourceDir, new Set(files.map((file) => `${file.filename}.tsx`)));
        removeStaleGeneratedFiles(distDir, new Set(files.flatMap((file) => [
            `${file.filename}.js`,
            `${file.filename}.d.ts`,
        ])));

        const renderedPackageFile = mustache.render(
            packageFileTemplate,
            {style, weight, grade: formatGrade(grade), packageName},
        );
        writeFileIfChanged(`${targetDir}/package.json`, renderedPackageFile);

        const renderedTsconfig = mustache.render(
            tsConfigFileTemplate,
            {style, weight, grade: formatGrade(grade), packageName},
        );
        writeFileIfChanged(`${targetDir}/tsconfig.json`, renderedTsconfig);

        const renderedReadme = mustache.render(
            readmeFileTemplate,
            {style, weight, grade: formatGrade(grade), packageName},
        );
        writeFileIfChanged(`${targetDir}/README.md`, renderedReadme);
    }
}

function removeStalePackageDirs(packagesDir, activePackageKeys) {
    if (!fs.existsSync(packagesDir)) {
        return;
    }

    for (const dirName of fs.readdirSync(packagesDir)) {
        const currentNameMatch = dirName.match(/^mui-material-symbols-(\d+)(?:-([np]\d+))?-(outlined|rounded|sharp)$/);
        const legacyNameMatch = dirName.match(/^mui-symbols-(outlined|rounded|sharp)-(\d+)$/);

        if (currentNameMatch == null && legacyNameMatch == null) {
            continue;
        }

        const packageKey = currentNameMatch != null
            ? getPackageKey(currentNameMatch[3], parseInt(currentNameMatch[1], 10), parseGradePackageSegment(currentNameMatch[2]))
            : getPackageKey(legacyNameMatch[1], parseInt(legacyNameMatch[2], 10), 0);

        if (legacyNameMatch != null || !activePackageKeys.has(packageKey)) {
            fs.rmSync(path.join(packagesDir, dirName), {
                recursive: true,
                force: true,
            });
        }
    }
}

function removeStaleGeneratedFiles(targetDir, expectedFileNames) {
    if (!fs.existsSync(targetDir)) {
        return;
    }

    for (const fileName of fs.readdirSync(targetDir)) {
        if (expectedFileNames.has(fileName)) {
            continue;
        }

        if (!/\.(ts|tsx|js|d\.ts|tsbuildinfo)$/.test(fileName)) {
            continue;
        }

        fs.rmSync(path.join(targetDir, fileName), {
            force: true,
        });
    }
}

function writeFileIfChanged(fileName, content) {
    // Avoid rewriting unchanged files. Besides reducing disk churn, this keeps
    // TypeScript's incremental compiler from invalidating work unnecessarily.
    if (fs.existsSync(fileName) && fs.readFileSync(fileName, {encoding: 'utf-8'}) === content) {
        return;
    }

    fs.mkdirSync(path.dirname(fileName), {
        recursive: true,
    });
    fs.writeFileSync(fileName, content);
}

function writeProgress(counter, total) {
    const message = `Progress ${counter}/${total} (${((counter / total) * 100).toFixed(2)}%)`;

    if (process.stdout.isTTY) {
        process.stdout.cursorTo(0);
        process.stdout.clearLine(0);
        process.stdout.write(message);
        return;
    }

    if (counter === total) {
        process.stdout.write(`${message}\n`);
    }
}

function main() {
    let options;

    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        process.stderr.write(`${error.message}\n\n`);
        printHelp();
        process.exit(1);
    }

    process.stdout.write('Transforming symbols...\n');

    let files;

    try {
        options.supportedIconsByStyle = loadSupportedIconsByStyle(options.metadataFile);
        files = findFiles(options);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exit(1);
    }

    const preparedFiles = prepareFiles(files, options);
    const unsupportedSelectedIconStyles = getUnsupportedSelectedIconStyles(options);

    if (preparedFiles.length === 0) {
        if (unsupportedSelectedIconStyles.length > 0) {
            process.stderr.write(`No matching symbol files found. Unsupported by Google Fonts metadata: ${formatLimitedList(unsupportedSelectedIconStyles, 10)}.\n`);
        } else {
            process.stderr.write('No matching symbol files found.\n');
        }
        process.exit(1);
    }

    if (unsupportedSelectedIconStyles.length > 0) {
        process.stderr.write(`Skipped ${unsupportedSelectedIconStyles.length} icon/style combination(s) unsupported by Google Fonts metadata: ${formatLimitedList(unsupportedSelectedIconStyles, 10)}.\n`);
    }

    writePackageFiles(preparedFiles, options);

    let counter = 0;

    for (const processedFile of preparedFiles) {
        writeTemplate(processedFile, options.packagesDir);
        counter++;
        writeProgress(counter, preparedFiles.length);
    }

    const packageCount = new Set(preparedFiles.map((file) => getPackageKey(file.style, file.weight, file.grade))).size;
    process.stdout.write(`Wrote ${preparedFiles.length} symbols into ${packageCount} package(s).\n`);
}

main();
