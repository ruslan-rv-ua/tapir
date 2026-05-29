/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Show_Tray_NotificationsInputs */

const uk_settings_show_tray_notifications = /** @type {(inputs: Settings_Show_Tray_NotificationsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Сповіщення при зміні треку`)
};

const en_settings_show_tray_notifications = /** @type {(inputs: Settings_Show_Tray_NotificationsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Notifications on track change`)
};

/**
* | output |
* | --- |
* | "Notifications on track change" |
*
* @param {Settings_Show_Tray_NotificationsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_show_tray_notifications = /** @type {((inputs?: Settings_Show_Tray_NotificationsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Show_Tray_NotificationsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_show_tray_notifications(inputs)
	return en_settings_show_tray_notifications(inputs)
});