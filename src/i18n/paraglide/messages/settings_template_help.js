/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Template_HelpInputs */

const uk_settings_template_help = /** @type {(inputs: Settings_Template_HelpInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Плейсхолдери: %s = станція, %a = виконавець, %t = трек, %d = дата, %time = час`)
};

const en_settings_template_help = /** @type {(inputs: Settings_Template_HelpInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Placeholders: %s = station, %a = artist, %t = track, %d = date, %time = time`)
};

/**
* | output |
* | --- |
* | "Placeholders: %s = station, %a = artist, %t = track, %d = date, %time = time" |
*
* @param {Settings_Template_HelpInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_template_help = /** @type {((inputs?: Settings_Template_HelpInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Template_HelpInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_template_help(inputs)
	return en_settings_template_help(inputs)
});