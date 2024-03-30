import { promises as fs } from 'fs';

export async function updateDeployment(key: string, value: any): Promise<void> {
    try {
        // mkdir
        const dirPath = './deployments';
        await fs.mkdir(dirPath, { recursive: true });

        const filePath = `${dirPath}/deployment.json`;

        // Read the file
        const data = await fs.readFile(filePath, 'utf8');

        // Parse the JSON data
        const json = JSON.parse(data);

        // Modify the JSON object by adding the key-value pair
        json[key] = value;

        // Convert the modified object back to JSON string
        const modifiedData = JSON.stringify(json, null, 2);

        // Write the modified JSON string back to the file
        await fs.writeFile(filePath, modifiedData, 'utf8');

        console.log('JSON file has been modified successfully.');
    } catch (error) {
        console.error('Error modifying JSON file:', error);
    }
}
