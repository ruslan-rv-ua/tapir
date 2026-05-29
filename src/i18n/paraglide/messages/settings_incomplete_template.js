/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Incomplete_TemplateInputs */

const uk_settings_incomplete_template = /** @type {(inputs: Settings_Incomplete_TemplateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Шаблон неповного файлу`)
};

const en_settings_incomplete_template = /** @type {(inputs: Settings_Incomplete_TemplateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Incomplete file template`)
};

/**
* | output |
* | --- |
* | "Incomplete file template" |
*
* @param {Settings_Incomplete_TemplateInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_incomplete_template = /** @type {((inputs?: Settings_Incomplete_TemplateInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Incomplete_TemplateInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_incomplete_template(inputs)
	return en_settings_incomplete_template(inputs)
});