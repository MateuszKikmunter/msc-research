import path from 'node:path';
import { config } from 'dotenv';

export function configureExperimentEnvironment(repositoryRoot: string): void {
    config({ path: path.join(repositoryRoot, '.env') });
}

export function runExperimentCli(
    main: () => Promise<void>,
    failureMessage: string
): void {
    main().catch((error: unknown) => {
        console.error(failureMessage, error);
        process.exitCode = 1;
    });
}
