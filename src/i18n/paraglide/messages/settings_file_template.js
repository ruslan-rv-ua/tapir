/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_File_TemplateInputs */

const uk_settings_file_template = /** @type {(inputs: Settings_File_TemplateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Шаблон імені треку`)
};

const en_settings_file_template = /** @type {(inputs: Settings_File_TemplateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Track file name template`)
};

/**
* | output |
* | --- |
* | "Track file name template" |
*
* @param {Settings_File_TemplateInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_file_template = /** @type {((inputs?: Settings_File_TemplateInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_File_TemplateInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_file_template(inputs)
	return en_settings_file_template(inputs)
});