/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Move_Stream_To_Profile_TitleInputs */

const uk_move_stream_to_profile_title = /** @type {(inputs: Move_Stream_To_Profile_TitleInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Перемістити «${i?.name}» у профіль`)
};

const en_move_stream_to_profile_title = /** @type {(inputs: Move_Stream_To_Profile_TitleInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Move “${i?.name}” to a profile`)
};

/**
* | output |
* | --- |
* | "Move “{name}” to a profile" |
*
* @param {Move_Stream_To_Profile_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const move_stream_to_profile_title = /** @type {((inputs: Move_Stream_To_Profile_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Move_Stream_To_Profile_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_move_stream_to_profile_title(inputs)
	return en_move_stream_to_profile_title(inputs)
});