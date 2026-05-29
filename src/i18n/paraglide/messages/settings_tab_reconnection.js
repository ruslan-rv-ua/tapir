/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Tab_ReconnectionInputs */

const uk_settings_tab_reconnection = /** @type {(inputs: Settings_Tab_ReconnectionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Перепідключення`)
};

const en_settings_tab_reconnection = /** @type {(inputs: Settings_Tab_ReconnectionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Reconnection`)
};

/**
* | output |
* | --- |
* | "Reconnection" |
*
* @param {Settings_Tab_ReconnectionInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_tab_reconnection = /** @type {((inputs?: Settings_Tab_ReconnectionInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Tab_ReconnectionInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_tab_reconnection(inputs)
	return en_settings_tab_reconnection(inputs)
});