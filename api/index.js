import { decode } from "he";
import got from "got";
import express from "express";
import { Meta } from "@antonthomzz/travex";

const app = express();

function ms_to_hours(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const hasHour = hours > 0 || days > 0;
    const timeStr = (hasHour ? `${String(hours).padStart(2, '0')}:` : '') +
        `${String(minutes).padStart(2, '0')}:` +
        `${String(seconds).padStart(2, '0')}`;

    return days > 0 ? `${days}d ${timeStr}` : timeStr;
}

function timestamp(v) {
    const date = new Date(v * 1000);
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();

    return `${d}-${m}-${y}`;
}

app.get("/api", async (req, res) => {
    const { url } = req.query;

    if (!/(?:https?:\/\/(?:[\w-]+\.)?(?:facebook\.com|fb\.watch)\/(?:[^#]*?!\/)?(?:(?:permalink\.php|video\/video\.php|photo\.php|video\.php|video\/embed|story\.php|watch(?:\/live)?\/?)\?(?:[^#]*?)(?:v|r|video_id|story_fbid)=|(?:[^\/]+)\/(?:v|r)\/|[^\/]+\/videos\/(?:[^\/]+\/)?|[^\/]+\/posts\/|events\/(?:[^\/]+\/)?|groups\/[^\/]+\/(?:permalink|posts)\/(?:[\da-f]+\/)?|watchparty\/)|facebook:)(?<id>pfbid[A-Za-z0-9]+|[\w-]+)/i.test(url)) {
        return res.end(
            JSON.stringify({
                ok: false,
                author: "Anton",
                msg: "Invalid input `url`"
            }, null, 2)
        );
    }

    try {
        const { body: html } = await got.get(url.replace("m.facebook.com", "www.facebook.com"), {
            headers: {
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "Accept-Language": "id-MM,id-ID;q=0.9,id;q=0.8,en-US;q=0.7,en;q=0.6",
                "Cache-Control": "max-age=0",
                "Priority": "u=0, i",
                "Sec-Ch-Prefers-Color-Scheme": "dark",
                "Sec-Ch-Ua": "\"Not;A=Brand\";v=\"8\", \"Chromium\";v=\"150\", \"Google Chrome\";v=\"150\"",
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Model": "\"\"",
                "Sec-Ch-Ua-Platform": "\"Linux\"",
                "Sec-Ch-Ua-Platform-Version": "\"\"",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "same-origin",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1",
                "Viewport-width": "150"
            }
        });

        const json = await html.findall("data-sjs>({.*?ScheduledServerJS.*?})</script>");
        const data = json.traverse("#videoDeliveryLegacyFields", { group: 1 });

        if (!data) {
            return res.end(
                JSON.stringify({
                    ok: false,
                    author: "Anton",
                    msg: "Metadata not found"
                }, null, 2)
            );
        }

        const format = Object.entries({
            "playable_url_quality_hd": "hd_native",
            "playable_url": "sd_native",
            "playable_url_dash": "dash_native",
            "browser_native_hd_url": "hd_native",
            "browser_native_sd_url": "sd_native"
        }).filter(([k]) => data[k]).map(([k, quality]) => ({
            quality,
            url: data[k]
        }));
        
        const data_title = await Meta("title", html);
        const data_thumbnail = await Meta("image", html);
        const data_description = await Meta("description", html);

        const data_duration = json.traverse("#playable_duration_in_ms", { group: 1, filter: ms_to_hours });
        const data_upload_date = json.traverse(["#publish_time", "#creation_time"], { group: 1, filter: timestamp });
        const data_timestamp = json.traverse(["#publish_time", "#creation_time"], { group: 1 });
        const data_uploader = json.traverse("require>...>video_owner>name", { group: 1 });
        const data_uploader_id = json.traverse("require>...>video_owner>id", { group: 1 });
        const data_uploader_url = json.traverse("require>...>video_owner>url", { group: 1 });

        return res.end(
            JSON.stringify({
                ok: true,
                author: "Anton",
                result: {
                    title: decode(data_title),
                    description: decode(data_description),
                    duration: data_duration,
                    upload_date: data_upload_date,
                    timestamp: data_timestamp,
                    uploader: data_uploader,
                    uploader_id: data_uploader_id,
                    uploader_url: data_uploader_url,
                    thumbnail: decode(data_thumbnail),
                    url:
                        format.find(f => "hd_native".includes(f.quality))?.url ??
                        format.find(f => "sd_native".includes(f.quality))?.url,
                    format
                }
            }, null, 2)
        );
    } catch (e) {
        return res.end(
            JSON.stringify({
                ok: false,
                author: "Anton",
                msg: e.message
            }, null, 2)
        );
    }
});

app.listen(3000, "0.0.0.0");
