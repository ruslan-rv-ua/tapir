/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Copy_Stream_To_Profile_TitleInputs */

const uk_copy_stream_to_profile_title = /** @type {(inputs: Copy_Stream_To_Profile_TitleInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Копіювати «${i?.name}» у профіль`)
};

const en_copy_stream_to_profile_title = /** @type {(inputs: Copy_Stream_To_Profile_TitleInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Copy “${i?.name}” to a profile`)
};

/**
* | output |
* | --- |
* | "Copy “{name}” to a profile" |
*
* @param {Copy_Stream_To_Profile_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const copy_stream_to_profile_title = /** @type {((inputs: Copy_Stream_To_Profile_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Copy_Stream_To_Profile_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_copy_stream_to_profile_title(inputs)
	return en_copy_stream_to_profile_title(inputs)
});