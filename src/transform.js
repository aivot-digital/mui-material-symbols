const glob = require('glob');
const fs = require('fs');
const data = require('./data.js');
const mustache = require('mustache');

const packagesDir = process.argv[2];

const symbolFileTemplate = fs.readFileSync('./src/templates/symbol.tsx.mustache', {
    encoding: 'utf-8',
});
const indexFileTemplate = fs.readFileSync('./src/templates/index.ts.mustache', {
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

/**
 * Find all SVG files in the specified directory and its subdirectories.
 * We only need the 24px icons.
 * Graded icons are excluded.
 * @param {string} targetStyle The target style to filter by (e.g., outlined, rounded, sharp).
 * @returns {string[]} Array of file paths.
 */
function findFiles() {
    return glob
        .globSync('.icons/symbols/web/**/*.svg')
        .filter((file) => file.endsWith('_24px.svg') && !file.includes('grad'));
}

/**
 * Prepare files for processing.
 * @param {string[]} files Array of file paths.
 * @returns {ProcessedFile[]} Processed array of file paths.
 */
function prepareFiles(files) {
    const processedFiles = [];

    for (const file of files) {
        const pathParts = file.split('/');
        const nameRaw = pathParts[3]; // Extract name from the path
        const {
            pascalCaseName,
            kebabCaseName,
        } = transformName(nameRaw);
        const style = data.styleNames[pathParts[4]]; // Extract style from the path

        const baseName = pathParts[pathParts.length - 1];
        const weightMatch = baseName.match(/wght(\d+)/);
        const weight = weightMatch ? parseInt(weightMatch[1], 10) : 400;
        const filled = baseName.includes('fill1');

        processedFiles.push({
            originalPath: file,
            kebabCaseName: kebabCaseName,
            pascalCaseName: pascalCaseName,
            style: style,
            weight: weight,
            filled: filled,
            filename: `${pascalCaseName}${filled ? 'Filled' : ''}`
        });
    }

    return processedFiles;
}

/**
 *
 * @param {string} name
 * @returns {{pascalCaseName: string, kebabCaseName: string}} Transformed names.
 */
function transformName(name) {
    if (/^\d+.*$/.test(name)) {
        const extractedNumberPrefix = name.match(/\d+/)[0];
        const numberAsWord = numberToWord(parseInt(extractedNumberPrefix, 10));
        name = name.replace(extractedNumberPrefix, numberAsWord + '_');
    }

    const pascalCaseName = name
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    const kebabCaseName = name
        .replaceAll('_', '-');

    return {
        pascalCaseName,
        kebabCaseName,
    };
}

/**
 * Convert a number to its word representation.
 * @param num {number} The number to convert.
 * @returns {string}
 */
function numberToWord(num) {
    if (data.numberToWordMap[num] != null) {
        return data.numberToWordMap[num];
    }

    if (num > 100) {
        return num
            .toString()
            .split('')
            .map(num => numberToWord(num))
            .join('');
    }

    const tens = Math.floor(num / 10) * 10;
    const units = num % 10;
    return data.numberToWordMap[tens] + (units > 0 ? data.numberToWordMap[units] : '');
}

function getTargetDir(style, weight) {
    return `${packagesDir}/mui-symbols-${style}-${weight}`;
}

/**
 * Write the template for the processed file.
 * @param {ProcessedFile} processedFile The processed file object.
 * @returns {void}
 */
function writeTemplate(processedFile) {
    const targetFolder = `${getTargetDir(processedFile.style, processedFile.weight)}/src/${processedFile.kebabCaseName}`;
    fs.mkdirSync(targetFolder, {
        recursive: true,
    });

    const originalContent = fs.readFileSync(processedFile.originalPath, {
        encoding: 'utf-8',
    });

    const renderedContent = mustache.render(symbolFileTemplate, {
        symbolComponentName: processedFile.filename,
        originalContent: originalContent,
    });

    const targetFile = `${targetFolder}/${processedFile.filename}.tsx`;
    fs.writeFileSync(targetFile, renderedContent);
}

process.stdout.write('Tansforming symbols...');

const files = findFiles();
const preparedFiles = prepareFiles(files);

let counter = 0;
for (const processedFile of preparedFiles) {
    writeTemplate(processedFile);
    counter++;

    process.stdout.cursorTo(0);
    process.stdout.clearLine(0);
    process.stdout.write(`Progress ${counter}/${preparedFiles.length} (${((counter / preparedFiles.length) * 100).toFixed(2)}%)`);
}

process.stdout.write('\n');

for (const style of data.styles) {
    for (const weight of data.weights) {
        const targetDir = getTargetDir(style, weight);
        const sourceDir = `${targetDir}/src`;

        fs.mkdirSync(sourceDir, {
            recursive: true,
        });

        const indexFileName = `${sourceDir}/index.ts`;
        const packageFileName = `${targetDir}/package.json`;
        const tsConfigName = `${targetDir}/tsconfig.json`;
        const readmeName = `${targetDir}/README.md`;

        const renderedIndexFile = mustache.render(
            indexFileTemplate,
            { files: preparedFiles.filter(fl => fl.style === style && fl.weight === weight) },
        );
        fs.writeFileSync(indexFileName, renderedIndexFile);

        const renderedPackageFile = mustache.render(
            packageFileTemplate,
            { style, weight },
        );
        fs.writeFileSync(packageFileName, renderedPackageFile);

        const renderedTsconfig = mustache.render(
            tsConfigFileTemplate,
            { style, weight },
        );
        fs.writeFileSync(tsConfigName, renderedTsconfig);

        const renderedReadme = mustache.render(
            readmeFileTemplate,
            { style, weight },
        );
        fs.writeFileSync(readmeName, renderedReadme);
    }
}
