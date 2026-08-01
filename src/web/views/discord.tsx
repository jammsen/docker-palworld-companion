import type { Child } from "hono/jsx";
import { Layout } from "./layout.js";

// Transparency over hiding: the page always renders BOTH mode groups. The
// active one is editable, the inactive one is greyed out showing its env
// values with a context line - a user always sees the same interface and
// where every value would come from.
export interface BotGroupValues {
  /** Active: override values ("" = no override). Inactive: env values, read-only */
  statusChannelId: string;
  logsChannelId: string;
  adminChannelId: string;
  updateIntervalSeconds: string;
  presenceEnabled: boolean;
  commandsEnabled: boolean;
  /** Env values shown as placeholders while editable */
  envStatusChannelId: string;
  envLogsChannelId: string;
  envAdminChannelId: string;
  envUpdateIntervalSeconds: string;
}

export interface WebhookGroupValues {
  webhookUrl: string;
  updateIntervalSeconds: string;
  envWebhookUrl: string;
  envUpdateIntervalSeconds: string;
}

export interface DiscordPageProps {
  t: (key: string) => string;
  language: string;
  csrf: string;
  activeMode: "bot" | "webhook" | "off";
  bot: BotGroupValues;
  webhook: WebhookGroupValues;
  /** The gameserver's own WEBHOOK_ENABLED - info only, not controllable here */
  gameserverWebhookEnabled: boolean;
  saved: boolean;
  errors?: string[];
}

function TextRow({
  t,
  name,
  labelKey,
  value,
  placeholder,
  active,
}: {
  t: (key: string) => string;
  name: string;
  labelKey: string;
  value: string;
  placeholder: string;
  active: boolean;
}) {
  return (
    <tr>
      <td>
        <label for={`discord-${name}`}>{t(labelKey)}</label>
      </td>
      <td>
        <input
          id={`discord-${name}`}
          type="text"
          name={name}
          value={value}
          placeholder={active ? placeholder || t("settings.discord.envHint") : ""}
          disabled={!active}
        />
      </td>
    </tr>
  );
}

function IntervalRow({
  t,
  idPrefix,
  value,
  placeholder,
  min,
  active,
}: {
  t: (key: string) => string;
  /** Both groups render an interval row on one page - the prefix keeps ids unique */
  idPrefix: string;
  value: string;
  placeholder: string;
  min: number;
  active: boolean;
}) {
  return (
    <tr>
      <td>
        <label for={`${idPrefix}-interval`}>
          {t("settings.discord.interval")} (≥{min}s)
        </label>
      </td>
      <td>
        <input
          id={`${idPrefix}-interval`}
          type="number"
          name="updateIntervalSeconds"
          value={value}
          placeholder={active ? placeholder : ""}
          min={min}
          step={1}
          disabled={!active}
        />
      </td>
    </tr>
  );
}

function CheckboxRow({
  t,
  name,
  labelKey,
  checked,
  active,
}: {
  t: (key: string) => string;
  name: string;
  labelKey: string;
  checked: boolean;
  active: boolean;
}) {
  return (
    <tr>
      <td>
        <label for={`discord-${name}`}>{t(labelKey)}</label>
      </td>
      <td>
        <input id={`discord-${name}`} type="checkbox" name={name} checked={checked} disabled={!active} />
      </td>
    </tr>
  );
}

/** Active group: form with save/reset. Inactive group: plain read-only table */
function GroupShell({
  t,
  csrf,
  active,
  children,
}: {
  t: (key: string) => string;
  csrf: string;
  active: boolean;
  children?: Child;
}) {
  if (!active) {
    return (
      <table class="settings-table">
        <tbody>{children}</tbody>
      </table>
    );
  }
  return (
    <>
      <form method="post" action="/discord">
        <input type="hidden" name="_csrf" value={csrf} />
        <table class="settings-table">
          <tbody>{children}</tbody>
        </table>
        <button type="submit">{t("settings.discord.save")}</button>
      </form>
      <form method="post" action="/discord/reset" class="inline">
        <input type="hidden" name="_csrf" value={csrf} />
        <button type="submit" class="secondary">
          {t("settings.discord.reset")}
        </button>
      </form>
    </>
  );
}

function BotGroup({
  t,
  csrf,
  values,
  active,
  saved,
}: {
  t: (key: string) => string;
  csrf: string;
  values: BotGroupValues;
  active: boolean;
  saved: boolean;
}) {
  return (
    <section>
      <h2>
        💬 {t("settings.discord.title")} {active ? "✅" : "💤"}
      </h2>
      {active && saved ? <p class="status-banner online">✅ {t("settings.discord.saved")}</p> : null}
      <p class="hint">{active ? t("settings.discord.note") : t("settings.discord.botInactive")}</p>
      <GroupShell t={t} csrf={csrf} active={active}>
        <TextRow
          t={t}
          name="statusChannelId"
          labelKey="settings.discord.statusChannel"
          value={values.statusChannelId}
          placeholder={values.envStatusChannelId}
          active={active}
        />
        <TextRow
          t={t}
          name="logsChannelId"
          labelKey="settings.discord.logsChannel"
          value={values.logsChannelId}
          placeholder={values.envLogsChannelId}
          active={active}
        />
        <TextRow
          t={t}
          name="adminChannelId"
          labelKey="settings.discord.adminChannel"
          value={values.adminChannelId}
          placeholder={values.envAdminChannelId}
          active={active}
        />
        <IntervalRow
          t={t}
          idPrefix="discord-bot"
          value={values.updateIntervalSeconds}
          placeholder={values.envUpdateIntervalSeconds}
          min={10}
          active={active}
        />
        <CheckboxRow
          t={t}
          name="presenceEnabled"
          labelKey="settings.discord.presence"
          checked={values.presenceEnabled}
          active={active}
        />
        <CheckboxRow
          t={t}
          name="commandsEnabled"
          labelKey="settings.discord.commands"
          checked={values.commandsEnabled}
          active={active}
        />
      </GroupShell>
    </section>
  );
}

function WebhookGroup({
  t,
  csrf,
  values,
  active,
  saved,
}: {
  t: (key: string) => string;
  csrf: string;
  values: WebhookGroupValues;
  active: boolean;
  saved: boolean;
}) {
  return (
    <section>
      <h2>
        💬 {t("settings.discord.titleWebhook")} {active ? "✅" : "💤"}
      </h2>
      {active && saved ? <p class="status-banner online">✅ {t("settings.discord.saved")}</p> : null}
      <p class="hint">{active ? t("settings.discord.noteWebhook") : t("settings.discord.webhookInactive")}</p>
      <GroupShell t={t} csrf={csrf} active={active}>
        <TextRow
          t={t}
          name="webhookUrl"
          labelKey="settings.discord.webhookUrl"
          value={values.webhookUrl}
          placeholder={values.envWebhookUrl}
          active={active}
        />
        <IntervalRow
          t={t}
          idPrefix="discord-webhook"
          value={values.updateIntervalSeconds}
          placeholder={values.envUpdateIntervalSeconds}
          min={15}
          active={active}
        />
      </GroupShell>
    </section>
  );
}

export function DiscordPage({
  t,
  language,
  csrf,
  activeMode,
  bot,
  webhook,
  gameserverWebhookEnabled,
  saved,
  errors,
}: DiscordPageProps) {
  return (
    <Layout t={t} language={language} activeNav="discord" csrf={csrf}>
      <h1>💬 {t("nav.discord")}</h1>
      {activeMode === "off" ? <p class="status-banner warn">⚠️ {t("settings.discord.disabled")}</p> : null}
      {errors && errors.length > 0 ? (
        <div class="status-banner error-banner">
          <strong>{t("settings.validationFailed")}</strong>
          <ul>
            {errors.map((error) => (
              <li>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <BotGroup t={t} csrf={csrf} values={bot} active={activeMode === "bot"} saved={saved} />
      <WebhookGroup t={t} csrf={csrf} values={webhook} active={activeMode === "webhook"} saved={saved} />
      <p class="hint">
        {gameserverWebhookEnabled
          ? t("settings.discord.gameserverWebhookOn")
          : t("settings.discord.gameserverWebhookOff")}
      </p>
    </Layout>
  );
}
