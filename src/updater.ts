import { AddOn } from '@busch-jaeger/free-at-home';
import { AddonClient } from "@busch-jaeger/free-at-home/lib/addon/AddonClient";
import FormData from "form-data";

const REPO = "piushartmann/ha-free-at-home-plugin"
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases`

type Version = [number, number, number];

interface Release {
    tag_name: string
    assets: AssetInfo[]
}

interface AssetInfo {
    url: string
}

interface Asset {
    browser_download_url: string
}

let downloadedVersion: Version = [0, 0, 0];

async function getAssetUrl(): Promise<[Version, string]> {
    const response = await fetch(RELEASES_API)
    if (!response.ok) {
        throw new Error(`UPDATER: Failed to get latest release (${response.status}).`)
    }

    const releases = (await response.json()) as Release[]

    if (!Array.isArray(releases) || releases.length === 0 || !releases[0].assets?.length) {
        throw new Error("UPDATER: Failed to get latest tag.")
    }

    const version = parseVersion(releases[0].tag_name);
    if (!version) {
        throw new Error(`UPDATER: Invalid release tag ${releases[0].tag_name}.`)
    }

    return [version, releases[0].assets[0].url]
}

async function getDownloadUrl(assetUrl: string): Promise<string> {
    const response = await fetch(assetUrl)
    if (!response.ok) {
        throw new Error(`UPDATER: Failed to get release asset metadata (${response.status}).`)
    }

    const asset = (await response.json()) as Asset

    if (!asset?.browser_download_url) {
        throw new Error("UPDATER: Failed to resolve download URL.")
    }

    return asset.browser_download_url
}

async function uploadFile(data: ArrayBuffer, addonApi: AddonClient): Promise<void> {
    const formData = new FormData();
    formData.append("data", Buffer.from(data), {
        filename: "addon.tar.gz",
        contentType: "application/gzip",
    });

    await addonApi.request.request({
        method: "POST",
        url: "/rest/ref",
        body: formData,
        headers: formData.getHeaders(),
        errors: {
            400: "Bad Request",
            401: "Authentication information is missing or invalid",
            502: "Bad Gateway error",
        },
    });
}

function parseVersion(tag: string): Version | undefined {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag);
    if (!match) {
        return undefined;
    }

    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left: Version, right: Version): number {
    for (let index = 0; index < left.length; index++) {
        if (left[index] !== right[index]) {
            return left[index] - right[index];
        }
    }

    return 0;
}

function shouldUpdate(newVersion: Version): boolean {
    return compareVersions(newVersion, downloadedVersion) > 0;
}

async function updateAddon(addOn: AddOn.AddOn): Promise<void> {
    const internalAddonApi = (addOn as any).api as AddonClient

    const [newVersion, url] = await getAssetUrl();
    if (!shouldUpdate(newVersion)) return
    console.log("UPDATER: New Version is available! Updating...")

    const downloadUrl = await getDownloadUrl(url)
    const response = await fetch(downloadUrl)

    if (!response.ok) {
        throw new Error(`UPDATER: Failed to download release asset (${response.status}).`)
    }

    await uploadFile(await response.arrayBuffer(), internalAddonApi)
    console.log("UPDATER: Release asset uploaded successfully.")

    downloadedVersion = newVersion
}

function setInitialDownloadedVersion(version: string) {
    downloadedVersion = parseVersion(version) ?? [0, 0, 0];
}

export { updateAddon, setInitialDownloadedVersion }