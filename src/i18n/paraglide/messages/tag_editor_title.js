/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Tag_Editor_TitleInputs */

const uk_tag_editor_title = /** @type {(inputs: Tag_Editor_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Редагувати теги`)
};

const en_tag_editor_title = /** @type {(inputs: Tag_Editor_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Edit tags`)
};

/**
* | output |
* | --- |
* | "Edit tags" |
*
* @param {Tag_Editor_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const tag_editor_title = /** @type {((inputs?: Tag_Editor_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tag_Editor_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_tag_editor_title(inputs)
	return en_tag_editor_title(inputs)
});