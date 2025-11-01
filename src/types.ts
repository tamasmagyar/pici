export interface PackageDependencies {
  [packageName: string]: string;
}

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: PackageDependencies;
  devDependencies?: PackageDependencies;
  peerDependencies?: PackageDependencies;
  optionalDependencies?: PackageDependencies;
  [key: string]: unknown;
}

export interface CustomPackageJson {
  dependencies?: PackageDependencies;
  [key: string]: unknown;
}

export type DependencyField =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

export enum PackageManager {
  YARN = 'yarn',
  NPM = 'npm',
}
