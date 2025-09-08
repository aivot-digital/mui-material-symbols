interface ProcessedFile {
    originalPath: string;
    kebabCaseName: string;
    pascalCaseName: string;
    style: 'outlined' | 'rounded' | 'sharp';
    weight: number;
    filled: boolean;
    filename: string;
}