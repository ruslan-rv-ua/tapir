/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Move_Disabled_ReasonInputs */

const uk_move_disabled_reason = /** @type {(inputs: Move_Disabled_ReasonInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Не можна перемістити активний потік`)
};

const en_move_disabled_reason = /** @type {(inputs: Move_Disabled_ReasonInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Can't move a stream while it's active`)
};

/**
* | output |
* | --- |
* | "Can't move a stream while it's active" |
*
* @param {Move_Disabled_ReasonInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const move_disabled_reason = /** @type {((inputs?: Move_Disabled_ReasonInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Move_Disabled_ReasonInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_move_disabled_reason(inputs)
	return en_move_disabled_reason(inputs)
});