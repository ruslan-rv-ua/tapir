/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Tag_Editor_SaveInputs */

const uk_tag_editor_save = /** @type {(inputs: Tag_Editor_SaveInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Зберегти`)
};

const en_tag_editor_save = /** @type {(inputs: Tag_Editor_SaveInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Save`)
};

/**
* | output |
* | --- |
* | "Save" |
*
* @param {Tag_Editor_SaveInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const tag_editor_save = /** @type {((inputs?: Tag_Editor_SaveInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tag_Editor_SaveInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_tag_editor_save(inputs)
	return en_tag_editor_save(inputs)
});