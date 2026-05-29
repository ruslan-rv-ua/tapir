/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Stream_TemplateInputs */

const uk_settings_stream_template = /** @type {(inputs: Settings_Stream_TemplateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Шаблон файлу потоку`)
};

const en_settings_stream_template = /** @type {(inputs: Settings_Stream_TemplateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Stream file template`)
};

/**
* | output |
* | --- |
* | "Stream file template" |
*
* @param {Settings_Stream_TemplateInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_stream_template = /** @type {((inputs?: Settings_Stream_TemplateInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Stream_TemplateInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_stream_template(inputs)
	return en_settings_stream_template(inputs)
});