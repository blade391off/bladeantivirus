
const OWNER = "blade391off";
const REPOSITORY = "bladeantivirus";

const API_URL =
    `https://api.github.com/repos/${OWNER}/${REPOSITORY}/releases`;

const REFRESH_INTERVAL = 5 * 60 * 1000;

const elements = {
    totalDownloads: document.getElementById("total-downloads"),
    totalReleases: document.getElementById("total-releases"),
    latestVersion: document.getElementById("latest-version"),

    downloadsUpdated: document.getElementById("downloads-updated"),
    downloadsError: document.getElementById("downloads-error"),

    releaseStatus: document.getElementById("release-status"),
    releaseVersion: document.getElementById("release-version"),
    releaseDate: document.getElementById("release-date"),
    releaseChangelog: document.getElementById("release-changelog"),
    releaseAssets: document.getElementById("release-assets"),
    assetsCount: document.getElementById("assets-count"),

    mainDownload: document.getElementById("main-download"),
    releasePage: document.getElementById("release-page"),
    releaseError: document.getElementById("release-error"),

    refreshButton: document.getElementById("refresh-button")
};

let loading = false;

function formatNumber(number) {
    return new Intl.NumberFormat("en-US").format(number);
}

function formatDate(date) {
    if (!date) return "Unknown";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
        return "Unknown";
    }

    return parsed.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) {
        return "Unknown size";
    }

    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function animateNumber(element, target) {
    const start = Number(element.dataset.value || 0);
    const duration = 900;
    const startTime = performance.now();

    function update(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        const current = Math.round(
            start + (target - start) * eased
        );

        element.textContent = formatNumber(current);

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.dataset.value = String(target);
        }
    }

    requestAnimationFrame(update);
}

function showError(element, message) {
    element.textContent = message;
    element.hidden = false;
}

function clearErrors() {
    elements.downloadsError.hidden = true;
    elements.releaseError.hidden = true;
}

async function fetchReleases() {
    const releases = [];
    const maxPages = 10;

    for (let page = 1; page <= maxPages; page++) {
        const url = `${API_URL}?per_page=100&page=${page}`;

        const response = await fetch(url, {
            headers: {
                "Accept": "application/vnd.github+json"
            }
        });

        if (!response.ok) {
            if (response.status === 403 || response.status === 429) {
                throw new Error(
                    "GitHub API rate limit reached. Try again later."
                );
            }

            if (response.status === 404) {
                throw new Error(
                    "Repository or releases not found."
                );
            }

            throw new Error(
                `GitHub API error: HTTP ${response.status}`
            );
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("Unexpected GitHub API response.");
        }

        releases.push(...data);

        if (data.length < 100) {
            break;
        }
    }

    return releases;
}

function updateDownloads(releases) {
    let totalDownloads = 0;

    for (const release of releases) {
        for (const asset of release.assets || []) {
            totalDownloads += Number(asset.download_count) || 0;
        }
    }

    animateNumber(
        elements.totalDownloads,
        totalDownloads
    );

    animateNumber(
        elements.totalReleases,
        releases.length
    );

    elements.downloadsUpdated.textContent =
        `Last updated: ${new Date().toLocaleTimeString("ru-RU")}`;
}

function updateLatestRelease(releases) {
    const published = releases.filter(
        release => !release.draft
    );

    // Prefer the newest stable release.
    // If no stable release exists, show the newest published release.
    const latest =
        published.find(release => !release.prerelease) ||
        published[0];

    if (!latest) {
        throw new Error("No published releases found.");
    }

    const version = latest.tag_name || latest.name || "Unknown";

    elements.latestVersion.textContent = version;
    elements.releaseVersion.textContent = version;
    elements.releaseDate.textContent =
        formatDate(latest.published_at || latest.created_at);

    elements.releaseStatus.textContent =
        latest.prerelease ? "PRE-RELEASE" : "LATEST STABLE";

    elements.releaseChangelog.textContent =
        latest.body?.trim() || "No release notes provided.";

    elements.releasePage.href = latest.html_url;

    renderAssets(latest);

    const assets = latest.assets || [];

    // Prefer the Windows installer/executable.
    const preferredAsset =
        assets.find(asset => asset.name.toLowerCase().endsWith(".exe")) ||
        assets[0];

    elements.mainDownload.href =
        preferredAsset?.browser_download_url || latest.html_url;

    elements.mainDownload.textContent =
        preferredAsset
            ? `↓ Download ${preferredAsset.name}`
            : "↓ View release on GitHub";
}

function renderAssets(release) {
    const assets = release.assets || [];

    elements.releaseAssets.replaceChildren();

    elements.assetsCount.textContent =
        `${assets.length} FILES`;

    if (assets.length === 0) {
        const empty = document.createElement("div");
        empty.className = "loading-placeholder";
        empty.textContent = "No downloadable files in this release.";
        elements.releaseAssets.appendChild(empty);
        return;
    }

    for (const asset of assets) {
        const item = document.createElement("div");
        item.className = "asset-item";

        const info = document.createElement("div");

        const name = document.createElement("div");
        name.className = "asset-name";
        name.textContent = asset.name;

        const meta = document.createElement("div");
        meta.className = "asset-meta";
        meta.textContent =
            `${formatSize(asset.size)} · ${formatNumber(asset.download_count || 0)} downloads`;

        info.append(name, meta);

        const link = document.createElement("a");
        link.className = "asset-download";
        link.href = asset.browser_download_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Download ↓";

        item.append(info, link);
        elements.releaseAssets.appendChild(item);
    }
}

async function loadData() {
    if (loading) return;

    loading = true;
    elements.refreshButton.disabled = true;
    elements.refreshButton.textContent = "↻ Loading...";

    clearErrors();

    try {
        const releases = await fetchReleases();

        updateDownloads(releases);
        updateLatestRelease(releases);

    } catch (error) {
        console.error("BladeAntivirus API error:", error);

        const message = error.message || "Unknown error.";

        showError(elements.downloadsError, message);
        showError(elements.releaseError, message);

        elements.downloadsUpdated.textContent =
            "Unable to update data.";

        elements.releaseStatus.textContent = "API ERROR";

    } finally {
        loading = false;
        elements.refreshButton.disabled = false;
        elements.refreshButton.textContent = "↻ Refresh";
    }
}

// Manual refresh
elements.refreshButton.addEventListener("click", loadData);

// Initial load
loadData();

// Automatic refresh every five minutes
setInterval(loadData, REFRESH_INTERVAL);
